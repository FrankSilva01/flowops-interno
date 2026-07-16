import {
  adminClient,
  amazonEndpoint,
  amazonMarketplaceId,
  applyCors,
  corsHeaders,
  getAmazonAccount,
  json,
  logSync,
  nextInternalOrderIds,
} from "../_shared/marketplace.ts";
import { requireOrgAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let actor = "Sistema";
  let organizationId = "";
  try {
    const access = await requireAdmin(req);
    actor = access.email;
    organizationId = access.organizationId;
    const account = await getAmazonAccount(organizationId);
    const action = new URL(req.url).searchParams.get("action") || "sync";
    if (action === "sync") {
      const [listings, orders] = await Promise.all([
        syncListings(account, organizationId),
        syncOrders(account, organizationId),
      ]);
      await logSync("Amazon", "manual-sync", "success", `${listings} anuncio(s) e ${orders.created} venda(s) importada(s)`, {
        organizationId,
        actorEmail: actor,
        rawPayload: { listings, orders },
      });
      return json({ ok: true, listing_count: listings, ...orders });
    }
    return json({ ok: false, error: "Acao Amazon invalida." }, { status: 400 });
  } catch (error) {
    await logSync("Amazon", "manual-sync", "error", error.message || String(error), {
      organizationId: organizationId || null,
      actorEmail: actor,
    }).catch(() => {});
    return json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }
});

async function spFetch(path: string, account: Record<string, any>) {
  const response = await fetch(`${amazonEndpoint()}${path}`, {
    headers: {
      "x-amz-access-token": account.access_token,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Amazon SP-API: ${JSON.stringify(data)}`);
  return data;
}

async function syncListings(account: Record<string, any>, organizationId: string) {
  const marketplaceId = amazonMarketplaceId();
  const sellerId = account.external_seller_id;
  const data = await spFetch(
    `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}?marketplaceIds=${marketplaceId}&pageSize=20&includedData=summaries,attributes,issues`,
    account,
  );
  const supabase = adminClient();
  let count = 0;
  for (const item of data.items || []) {
    const summary = item.summaries?.[0] || {};
    const attributes = item.attributes || {};
    const image = attributes.main_product_image_locator?.[0]?.media_location || "";
    await supabase.from("marketplace_listings").upsert({
      organization_id: organizationId,
      marketplace: "Amazon",
      external_id: String(item.sku || ""),
      title: summary.itemName || item.sku || "Produto Amazon",
      sku: item.sku || null,
      price: Number(attributes.purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax || 0),
      status: item.issues?.length ? "warning" : "active",
      permalink: summary.asin ? `https://www.amazon.com.br/dp/${summary.asin}` : null,
      thumbnail_url: image || null,
      raw_payload: { ...item, asin: summary.asin, sold_quantity: 0 },
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,marketplace,external_id" });
    count += 1;
  }
  return count;
}

async function syncOrders(account: Record<string, any>, organizationId: string) {
  const createdAfter = new Date(Date.now() - 30 * 86400000).toISOString();
  const data = await spFetch(
    `/orders/v0/orders?MarketplaceIds=${amazonMarketplaceId()}&CreatedAfter=${encodeURIComponent(createdAfter)}&MaxResultsPerPage=50`,
    account,
  );
  const supabase = adminClient();
  let created = 0;
  let ignored = 0;
  for (const order of data.payload?.Orders || []) {
    const externalId = String(order.AmazonOrderId || "");
    const { data: existing } = await supabase.from("marketplace_order_links")
      .select("internal_order_id")
      .eq("organization_id", organizationId)
      .eq("marketplace", "Amazon")
      .eq("external_order_id", externalId)
      .maybeSingle();
    if (existing) {
      ignored += 1;
      continue;
    }
    const ids = await nextInternalOrderIds(organizationId);
    const notes = {
      text: "Importado da Amazon",
      orderCode: ids.orderCode,
      marketplaceOrderCode: externalId,
      tags: ["Amazon"],
      productionStage: "Em fila",
      source: "amazon",
      marketplaceRaw: order,
    };
    const total = Number(order.OrderTotal?.Amount || 0);
    const internal = {
      id: ids.id,
      organization_id: organizationId,
      client: order.BuyerInfo?.BuyerName || "",
      description: `Venda Amazon ${externalId}`,
      material: null,
      order_date: String(order.PurchaseDate || "").slice(0, 10) || null,
      delivery_date: String(order.LatestShipDate || "").slice(0, 10) || null,
      status: "A preparar",
      quantity: Number(order.NumberOfItemsShipped || 0) + Number(order.NumberOfItemsUnshipped || 0) || 1,
      charged: total,
      received: 0,
      notes: JSON.stringify(notes),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("orders").insert(internal);
    if (error) throw error;
    await supabase.from("marketplace_order_links").insert({
      organization_id: organizationId,
      marketplace: "Amazon",
      external_order_id: externalId,
      internal_order_id: ids.id,
      raw_payload: order,
    });
    await supabase.from("notifications").insert({
      organization_id: organizationId,
      role_target: "editor",
      type: "marketplace",
      title: "Nova venda importada da Amazon",
      message: `${externalId} vinculada ao ${ids.orderCode}`,
      related_entity: "order",
      related_entity_id: ids.id,
    });
    created += 1;
  }
  return { created, ignored };
}

async function requireAdmin(req: Request) {
  const supabase = adminClient();
  return await requireOrgAdmin(req, supabase);
}
