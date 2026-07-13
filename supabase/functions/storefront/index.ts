import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeadersFor } from "../_shared/http.ts";
import { requireOrgAdmin } from "../_shared/auth.ts";

const DEFAULT_STOREFRONT_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function applyCors(req: Request) {
  for (const key of Object.keys(corsHeaders)) delete (corsHeaders as Record<string, string>)[key];
  Object.assign(corsHeaders, corsHeadersFor(req));
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = adminClient();
    if (req.method === "GET") {
      const organizationId = storefrontOrganizationId(req);
      const [productsResult, reviewsResult] = await Promise.all([
        admin
          .from("marketplace_listings")
          .select("marketplace,external_id,title,sku,price,status,permalink,thumbnail_url,raw_payload,updated_at")
          .eq("organization_id", organizationId)
          .order("updated_at", { ascending: false })
          .limit(200),
        admin
          .from("marketplace_reviews")
          .select("marketplace,external_product_id,rating,title,comment,author_name,review_date")
          .eq("organization_id", organizationId)
          .eq("status", "published")
          .order("review_date", { ascending: false })
          .limit(1000),
      ]);
      if (productsResult.error) throw productsResult.error;
      const reviews = reviewsResult.error ? [] : reviewsResult.data || [];
      return json({
        ok: true,
        products: (productsResult.data || []).map((row) => normalizeProduct(
          row,
          reviews.filter((review) =>
            review.marketplace === row.marketplace && review.external_product_id === row.external_id
          ),
        )).filter(Boolean),
      });
    }

    if (req.method !== "POST") return json({ ok: false, error: "Use GET ou POST." }, 405);
    const body = await req.json();
    const action = String(body.action || "save");
    const organizationId = storefrontOrganizationId(req);
    if (action === "custom-quote") return await createCustomQuote(body, admin, organizationId);
    if (action === "track-event") return await trackStorefrontEvent(body, admin, organizationId);

    const actor = await requireAdmin(req, admin);
    if (action === "delete") {
      const marketplace = String(body.marketplace || "Vitrine");
      const externalId = String(body.external_id || "");
      if (!externalId) return json({ ok: false, error: "Produto invalido." }, 400);
      const { error } = await admin
        .from("marketplace_listings")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("organization_id", actor.organizationId)
        .eq("marketplace", marketplace)
        .eq("external_id", externalId);
      if (error) throw error;
      return json({ ok: true });
    }

    const title = String(body.title || "").trim();
    const price = Number(body.price || 0);
    const marketplace = String(body.marketplace || "Vitrine").trim() || "Vitrine";
    const externalId = String(body.external_id || `STORE-${crypto.randomUUID()}`).trim();
    if (!title) return json({ ok: false, error: "Titulo obrigatorio." }, 400);
    if (!price || price < 0) return json({ ok: false, error: "Preco obrigatorio." }, 400);

    const imageUrls = Array.isArray(body.image_urls)
      ? body.image_urls.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : imageList(body.image_url).map((item) => item.secure_url || item.url).filter(Boolean);

    const rawPayload = {
      ...(typeof body.raw_payload === "object" && body.raw_payload ? body.raw_payload : {}),
      source: "storefront-admin",
      description: String(body.description || "").trim(),
      category: String(body.category || "Action figures").trim(),
      featured: Boolean(body.featured),
      payment_note: String(body.payment_note || "").trim(),
      delivery_note: String(body.delivery_note || "").trim(),
      description_html: String(body.raw_payload?.description_html || body.description_html || "").trim(),
      shopee_url: String(body.raw_payload?.shopee_url || body.shopee_url || "").trim(),
      amazon_url: String(body.raw_payload?.amazon_url || body.amazon_url || "").trim(),
      whatsapp_url: String(body.raw_payload?.whatsapp_url || body.whatsapp_url || "").trim(),
      technical_info: typeof body.raw_payload?.technical_info === "object" ? body.raw_payload.technical_info : {},
      publish_targets: typeof body.publish_targets === "object" && body.publish_targets ? body.publish_targets : { vitrine: true },
      marketplace_publish_status: body.publish_targets?.mercado_livre ? "published_or_attempted" : "",
      pictures: imageUrls.map((url) => ({ secure_url: url, url })),
      storefront_updated_by: actor.email,
      storefront_updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("marketplace_listings").upsert({
      organization_id: actor.organizationId,
      marketplace,
      external_id: externalId,
      title,
      sku: String(body.sku || "").trim() || null,
      price,
      status: String(body.status || "active"),
      permalink: String(body.marketplace_url || "").trim() || null,
      thumbnail_url: imageUrls[0] || null,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,marketplace,external_id" });
    if (error) throw error;
    return json({ ok: true, product: { marketplace, external_id: externalId } });
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
});

function adminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("Configuracao do Supabase ausente.");
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAdmin(req: Request, admin: ReturnType<typeof createClient>) {
  // service_role e necessario para publicar produtos na vitrine e receber
  // orcamentos publicos, mas alteracoes administrativas exigem usuario admin
  // ativo dentro da empresa atual.
  return await requireOrgAdmin(req, admin);
}

function storefrontOrganizationId(req: Request) {
  const url = new URL(req.url);
  const candidate = String(url.searchParams.get("organization_id") || Deno.env.get("STOREFRONT_ORGANIZATION_ID") || DEFAULT_STOREFRONT_ORGANIZATION_ID);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    return DEFAULT_STOREFRONT_ORGANIZATION_ID;
  }
  return candidate;
}

async function createCustomQuote(body: Record<string, any>, admin: ReturnType<typeof createClient>, organizationId: string) {
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const whatsapp = String(body.whatsapp || "").trim();
  const description = String(body.description || "").trim();
  const desiredSize = String(body.desired_size || "").trim();
  const material = String(body.material || "").trim();
  const images = Array.isArray(body.images) ? body.images : [];
  const firstImageUrl = String(images[0]?.data_url || "");
  const stlDataUrl = String(body.stl_file?.data_url || "");
  if (!name || !email || !whatsapp || !description) {
    return json({ ok: false, error: "Preencha nome, e-mail, WhatsApp e descricao." }, 400);
  }

  const ids = await nextOrderIds(admin, organizationId);
  const now = new Date().toISOString();
  const lead = await upsertLead(admin, {
    organizationId,
    name,
    email,
    whatsapp,
    description,
    orderId: ids.id,
    now,
  });
  const notes = {
    text: "Solicitacao de orcamento pela vitrine",
    orderCode: ids.orderCode,
    marketplaceOrderCode: "",
    internalNotes: [
      "Origem: Vitrine - Personalizado",
      `Nome: ${name}`,
      `E-mail: ${email}`,
      `WhatsApp: ${whatsapp}`,
      desiredSize ? `Tamanho desejado: ${desiredSize}` : "",
      material ? `Material: ${material}` : "",
      `Descricao: ${description}`,
    ].filter(Boolean).join("\n"),
    stlLink: stlDataUrl,
    referenceImageUrl: firstImageUrl,
    tags: ["Personalizado", "Vitrine", "Orçamento"],
    priority: "Normal",
    productionStage: "",
    responsible: "",
    quoteStage: "Solicitado",
    quoteUpdatedAt: now,
    leadId: lead.id,
    stlFile: body.stl_file || null,
    referenceImages: images,
    source: "vitrine-personalizado",
    history: [{
      at: now,
      by: "Vitrine",
      changes: [{ field: "Origem", from: "-", to: "Personalizado" }],
    }],
  };

  const { error } = await admin.from("orders").insert({
    organization_id: organizationId,
    id: ids.id,
    client: name,
    description: `Personalizado - ${description.slice(0, 90)}`,
    material: material || null,
    color: "",
    order_date: now.slice(0, 10),
    delivery_date: null,
    status: "Orçamento",
    quantity: 1,
    charged: 0,
    received: 0,
    notes: JSON.stringify(notes),
    updated_at: now,
  });
  if (error) throw error;
  await Promise.all([
    admin.from("audit_events").insert({
      organization_id: organizationId,
      action: "create",
      entity_type: "order",
      entity_id: ids.id,
      order_code: ids.orderCode,
      new_value: { quoteStage: "Solicitado", leadId: lead.id, source: "vitrine" },
      source: "vitrine",
    }),
    admin.from("notifications").insert([
      {
        organization_id: organizationId,
        role_target: "editor",
        type: "quote",
        title: "Novo orçamento recebido",
        message: `${ids.orderCode} - ${name}`,
        related_entity: "order",
        related_entity_id: ids.id,
        priority: "high",
      },
      {
        organization_id: organizationId,
        role_target: "editor",
        type: "lead",
        title: lead.created ? "Novo lead criado" : "Lead atualizado",
        message: `${name} solicitou um personalizado`,
        related_entity: "lead",
        related_entity_id: lead.id,
        priority: "normal",
      },
    ]),
    admin.from("storefront_events").insert({
      organization_id: organizationId,
      event_type: "custom_quote",
      product_id: ids.orderCode,
      marketplace: "Vitrine",
      session_id: String(body.session_id || ""),
      metadata: { lead_id: lead.id, order_id: ids.id },
    }),
  ]);
  return json({ ok: true, order_id: ids.id, order_code: ids.orderCode });
}

async function upsertLead(
  admin: ReturnType<typeof createClient>,
  input: { organizationId: string; name: string; email: string; whatsapp: string; description: string; orderId: string; now: string },
) {
  const cleanPhone = input.whatsapp.replace(/\D/g, "");
  let data: Record<string, any> | null = null;
  if (input.email) {
    const result = await admin.from("crm_leads").select("*").eq("organization_id", input.organizationId).eq("email", input.email).limit(1).maybeSingle();
    data = result.data;
  }
  if (!data && cleanPhone) {
    const result = await admin.from("crm_leads").select("*").eq("organization_id", input.organizationId).eq("whatsapp", input.whatsapp).limit(1).maybeSingle();
    data = result.data;
  }
  const notes = [
    data?.notes || "",
    `[${input.now}] Novo orçamento: ${input.description}`,
  ].filter(Boolean).join("\n");
  const linked = [...new Set([...(data?.linked_order_ids || []), input.orderId])];
  const payload = {
    organization_id: input.organizationId,
    id: data?.id || crypto.randomUUID(),
    name: input.name,
    email: input.email || data?.email || null,
    whatsapp: input.whatsapp || data?.whatsapp || null,
    origin: "Vitrine",
    status: data?.status === "Convertido" ? "Cliente recorrente" : (data?.status || "Novo"),
    notes,
    linked_order_ids: linked,
    created_at: data?.created_at || input.now,
    updated_at: input.now,
  };
  const { error } = await admin.from("crm_leads").upsert(payload);
  if (error) throw error;
  return { id: payload.id, created: !data, cleanPhone };
}

async function trackStorefrontEvent(body: Record<string, any>, admin: ReturnType<typeof createClient>, organizationId: string) {
  const eventType = String(body.event_type || "");
  if (!["product_view", "buy_click", "quote_click"].includes(eventType)) {
    return json({ ok: false, error: "Evento invalido." }, 400);
  }
  const { error } = await admin.from("storefront_events").insert({
    organization_id: organizationId,
    event_type: eventType,
    product_id: String(body.product_id || ""),
    marketplace: String(body.marketplace || ""),
    session_id: String(body.session_id || ""),
    metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
  });
  if (error) throw error;
  return json({ ok: true });
}

async function nextOrderIds(admin: ReturnType<typeof createClient>, organizationId: string) {
  const { data, error } = await admin.from("orders").select("id,notes").eq("organization_id", organizationId);
  if (error) throw error;
  let maxNumber = 0;
  for (const row of data || []) {
    const idMatch = String(row.id || "").match(/(?:ENC|PED)-(\d+)/i);
    if (idMatch) maxNumber = Math.max(maxNumber, Number(idMatch[1]) || 0);
    try {
      const parsed = JSON.parse(String(row.notes || "{}"));
      const codeMatch = String(parsed.orderCode || "").match(/PED-(\d+)/i);
      if (codeMatch) maxNumber = Math.max(maxNumber, Number(codeMatch[1]) || 0);
    } catch {
      // Legacy notes can be plain text.
    }
  }
  const next = maxNumber + 1;
  return {
    id: `ENC-${String(next).padStart(3, "0")}`,
    orderCode: `PED-${String(next).padStart(4, "0")}`,
  };
}

function imageList(imageUrl: unknown) {
  const url = String(imageUrl || "").trim();
  return url ? [{ secure_url: url, url }] : [];
}

function normalizeProduct(row: Record<string, any>, reviews: Record<string, any>[] = []) {
  if (String(row.status || "").toLowerCase() === "closed") return null;
  const payload = row.raw_payload || {};
  const pictures = Array.isArray(payload.pictures) ? payload.pictures : [];
  const images = [
    ...pictures.map((item: Record<string, any>) => item.secure_url || item.url).filter(Boolean),
    row.thumbnail_url,
  ].filter(Boolean);
  const marketplace = String(row.marketplace || "Marketplace");
  const price = Number(row.price || payload.price || 0);
  return {
    marketplace,
    external_id: String(row.external_id || payload.id || ""),
    title: row.title || payload.title || "Produto sem titulo",
    description: payload.description || buildDescription(row, payload),
    category: payload.category || payload.domain_id || "Action figures",
    price,
    status: row.status || payload.status || "active",
    marketplace_url: row.permalink || payload.permalink || "",
    image_url: images[0] || "",
    images: [...new Set(images)],
    sku: row.sku || payload.seller_custom_field || "",
    featured: Boolean(payload.featured) || marketplace === "Mercado Livre",
    available_quantity: Number(payload.available_quantity || 0),
    sold_quantity: Number(payload.sold_quantity || 0),
    free_shipping: Boolean(payload.shipping?.free_shipping),
    payment_note: payload.payment_note || paymentNote(marketplace, price, payload),
    delivery_note: payload.delivery_note || deliveryNote(marketplace, payload),
    buy_links: {
      mercado_livre: row.permalink || payload.permalink || "",
      shopee: payload.shopee_url || "",
      amazon: payload.amazon_url || (marketplace === "Amazon" ? row.permalink || "" : ""),
      whatsapp: payload.whatsapp_url || "",
    },
    reviews,
    rating_average: reviews.length
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
      : Number(payload.rating_average || 0),
    rating_count: reviews.length || Number(payload.rating_count || 0),
    updated_at: row.updated_at,
    raw_payload: payload,
  };
}

function buildDescription(row: Record<string, any>, payload: Record<string, any>) {
  const condition = payload.condition === "new" ? "Produto novo" : "Produto artesanal de impressao 3D";
  const availability = payload.sale_terms?.find?.((item: Record<string, any>) => item.id === "MANUFACTURING_TIME")?.value_name;
  return [
    condition,
    "Item anunciado em nossa loja. Confira detalhes, prazo e condicoes finais no marketplace antes de concluir a compra.",
    availability ? `Disponibilidade informada: ${availability}.` : "",
    row.sku ? `SKU: ${row.sku}.` : "",
  ].filter(Boolean).join(" ");
}

function paymentNote(marketplace: string, price: number, payload: Record<string, any>) {
  if (marketplace === "Mercado Livre") {
    const installment = price ? `ate 12x a partir de ${money(price / 12)}` : "parcelamento disponivel";
    return `Mercado Pago: ${installment}. Condicoes finais no Mercado Livre.`;
  }
  if (marketplace === "Shopee") return "Pagamento e frete conforme regras da Shopee.";
  if (marketplace === "Amazon") return "Pagamento, parcelamento e frete conforme regras da Amazon.";
  return "Pagamento finalizado no marketplace informado.";
}

function deliveryNote(marketplace: string, payload: Record<string, any>) {
  if (payload.delivery_note) return String(payload.delivery_note);
  const availability = payload.sale_terms?.find?.((item: Record<string, any>) => item.id === "MANUFACTURING_TIME")?.value_name;
  if (availability) return `As datas de entrega incluem os ${availability} necessarios para deixar o produto pronto.`;
  if (marketplace === "Mercado Livre") return "Confira o prazo final de entrega no Mercado Livre antes de concluir a compra.";
  if (marketplace === "Shopee") return "Confira o prazo final de entrega na Shopee antes de concluir a compra.";
  if (marketplace === "Amazon") return "Confira o prazo final de entrega na Amazon antes de concluir a compra.";
  return "";
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
