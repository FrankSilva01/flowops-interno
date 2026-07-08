import {
  adminClient,
  applyCors,
  corsHeaders,
  json,
  logSync,
} from "../_shared/marketplace.ts";

// Recebe webhooks do Mercado Livre quando anúncios são atualizados
// GET /marketplace-webhook?resource=item_id:MLxxx&action=updated
// Ou POST com payload JSON quando anúncio é editado

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const resource = url.searchParams.get("resource") || "";
    const action = url.searchParams.get("action") || "updated";

    // Webhook do ML vem como: resource=item_id:123456789 ou resource=orders:123456789
    if (!resource) {
      return json({ ok: false, error: "resource obrigatorio" }, { status: 400 });
    }

    const [resourceType, resourceId] = resource.split(":");
    if (!resourceId) {
      return json({ ok: false, error: "formato invalido (resource=tipo:id)" }, { status: 400 });
    }

    // Só sincroniza anúncios (item_id), não pedidos
    if (resourceType !== "item_id") {
      console.log(`⏭️ Ignorando webhook de ${resourceType}`);
      return json({ ok: true, skipped: true });
    }

    const supabase = adminClient();
    const { data: listings, error: listError } = await supabase
      .from("marketplace_listings")
      .select("organization_id,external_id")
      .eq("marketplace", "Mercado Livre")
      .eq("external_id", resourceId)
      .limit(1);

    if (listError) throw listError;
    if (!listings || listings.length === 0) {
      console.log(`⏭️ Anúncio ${resourceId} não vinculado a nenhum produto local`);
      return json({ ok: true, skipped: true });
    }

    const listing = listings[0];
    const organizationId = listing.organization_id;

    // Busca a conta ML da organização
    const { data: account, error: accountError } = await supabase
      .from("marketplace_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("marketplace", "Mercado Livre")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      throw new Error("Conta Mercado Livre não configurada");
    }

    // Trigger a sincronização de taxas para este anúncio
    console.log(`🔄 Webhook: sincronizando taxas de ${resourceId}`);

    // Chama a função de sincronização
    const syncResult = await syncFeeForWebhook(
      resourceId,
      account,
      organizationId,
    );

    await logSync(
      "Mercado Livre",
      "webhook-fee-sync",
      syncResult.ok ? "success" : "error",
      syncResult.message,
      {
        organizationId,
        externalItemId: resourceId,
        rawPayload: { resource, action, sync_result: syncResult },
      },
    );

    return json({ ok: true, synced: syncResult.ok, message: syncResult.message });
  } catch (error) {
    console.error("Webhook error:", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});

async function syncFeeForWebhook(
  itemId: string,
  account: Record<string, any>,
  organizationId: string,
) {
  const supabase = adminClient();

  try {
    // Busca item do ML
    const headers = { Authorization: `Bearer ${account.access_token}` };
    const itemResponse = await fetch(
      `https://api.mercadolibre.com/items/${itemId}`,
      { headers },
    );
    const item = await itemResponse.json();

    if (!itemResponse.ok) {
      return {
        ok: false,
        message: `Falha ao consultar anúncio ${itemId}`,
      };
    }

    // Busca preço/taxas
    const priceParams = new URLSearchParams({
      price: String(item.price || 0),
      listing_type_id: String(item.listing_type_id || "gold_special"),
    });
    if (item.category_id) priceParams.set("category_id", item.category_id);

    const priceResponse = await fetch(
      `https://api.mercadolibre.com/sites/MLB/listing_prices?${priceParams.toString()}`,
      { headers },
    );
    const priceData = await priceResponse.json();
    const priceInfo = Array.isArray(priceData) ? priceData[0] : priceData;

    if (!priceResponse.ok || !priceInfo) {
      return {
        ok: false,
        message: `Falha ao consultar taxas de ${itemId}`,
      };
    }

    // Busca frete usando mesma lógica de getShippingCosts
    let shipping = null;
    const SHIPPING_REFERENCE_ZIPS: Record<string, string> = { SP: "01310100", RJ: "20040020", BH: "30130010" };
    const freeShipping = Boolean(item.shipping?.free_shipping);
    const costsByCity: Record<string, number | null> = {};
    const grossCostsByCity: Record<string, number | null> = {};

    for (const city of Object.keys(SHIPPING_REFERENCE_ZIPS)) {
      const zip = SHIPPING_REFERENCE_ZIPS[city];
      try {
        const shippingResponse = await fetch(
          `https://api.mercadolibre.com/shipments/costs?item_id=${itemId}&zip_code=${zip}`,
          { headers },
        );

        if (!shippingResponse.ok) {
          console.warn(`⚠️ /shipments/costs falhou pra ${city}: ${shippingResponse.status}`);
          costsByCity[city] = null;
          grossCostsByCity[city] = null;
          continue;
        }

        const data = await shippingResponse.json();
        console.log(`📦 /shipments/costs resposta ${city}:`, JSON.stringify(data).slice(0, 200));

        const grossAmount = Number(data.gross_amount ?? data.cost ?? data.shipping?.cost ?? 0);
        const senderCost = Array.isArray(data.senders) && data.senders.length
          ? Number(data.senders[0]?.cost ?? grossAmount)
          : Number(data.cost ?? data.shipping?.cost ?? grossAmount);

        costsByCity[city] = senderCost;
        grossCostsByCity[city] = grossAmount;
      } catch (e) {
        console.error(`❌ Erro fetching frete ${city}:`, e instanceof Error ? e.message : String(e));
        costsByCity[city] = null;
        grossCostsByCity[city] = null;
      }
    }

    const knownCosts = Object.values(costsByCity).filter((value): value is number => value !== null);
    const knownGrossCosts = Object.values(grossCostsByCity).filter((value): value is number => value !== null);
    const avgSellerCost = knownCosts.length ? knownCosts.reduce((sum, value) => sum + value, 0) / knownCosts.length : 0;
    const avgGrossCost = knownGrossCosts.length ? knownGrossCosts.reduce((sum, value) => sum + value, 0) / knownGrossCosts.length : 0;

    const sellerShippingCost = freeShipping ? avgSellerCost : 0;
    const grossShippingCost = freeShipping ? (avgGrossCost || avgSellerCost) : 0;
    const shippingSubsidized = Math.max(grossShippingCost - sellerShippingCost, 0);

    shipping = { free_shipping: freeShipping, costs_by_city: costsByCity, gross_costs_by_city: grossCostsByCity, avg_seller_cost: avgSellerCost, avg_gross_cost: avgGrossCost };

    // Calcula taxa real
    const price = Number(item.price || 0);
    const saleFeeAmount = Number(priceInfo.sale_fee_amount || 0);
    const feeDetails = priceInfo.sale_fee_details || {};
    const fixedFeeReal = Number(feeDetails.fixed_fee || 0);
    const percentageFeeReal = feeDetails.percentage_fee != null
      ? Number(feeDetails.percentage_fee)
      : (price > 0 ? ((saleFeeAmount - fixedFeeReal) / price) * 100 : 0);

    // Salva snapshot
    const { error: insertError } = await supabase.from("listing_fee_sync").insert({
      organization_id: organizationId,
      external_id: itemId,
      marketplace: "Mercado Livre",
      listing_type_id: item.listing_type_id || null,
      category_id: item.category_id || null,
      price,
      real_fee_pct: percentageFeeReal,
      real_fee_fixed: fixedFeeReal,
      shipping_cost: sellerShippingCost,
      shipping_subsidized: shippingSubsidized,
      free_shipping: freeShipping,
      raw_payload: { price_info: priceInfo, shipping },
    });

    if (insertError) throw insertError;

    return {
      ok: true,
      message: `Taxas de ${itemId} sincronizadas via webhook (taxa: ${percentageFeeReal.toFixed(1)}%, frete: R$ ${sellerShippingCost.toFixed(2)})`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
