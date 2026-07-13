import {
  adminClient,
  applyCors,
  corsHeaders,
  getMlAccountByUserId,
  json,
} from "../_shared/marketplace.ts";

// Busca o custo REAL de frete de uma ordem feita no Mercado Livre
// GET /get-real-shipping-cost?order_id=2000017248423800&organization_id=xxx
// Retorna: { shipping_cost, shipping_subsidized, list_cost }

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id") || "";
    const organizationId = url.searchParams.get("organization_id") || "";

    if (!orderId) return json({ ok: false, error: "order_id obrigatorio" }, { status: 400 });
    if (!organizationId) return json({ ok: false, error: "organization_id obrigatorio" }, { status: 400 });

    const supabase = adminClient();
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "Autenticacao obrigatoria" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const email = userData.user?.email?.toLowerCase();
    if (userError || !email) return json({ ok: false, error: "Sessao invalida" }, { status: 401 });
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("organization_id,role,status")
      .eq("organization_id", organizationId)
      .eq("user_email", email)
      .eq("status", "active")
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) return json({ ok: false, error: "Acesso negado para esta organizacao" }, { status: 403 });

    // Busca a conta ML da organização
    const { data: account, error: accountError } = await supabase
      .from("marketplace_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("marketplace", "Mercado Livre")
      .eq("status", "connected")
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) throw new Error("Conta Mercado Livre não configurada");

    const headers = { Authorization: `Bearer ${account.access_token}` };

    // 1) Busca a ordem pra pegar o shipping.id
    console.log(`📦 Buscando ordem ${orderId}...`);
    const orderResponse = await fetch(
      `https://api.mercadolibre.com/orders/${orderId}`,
      { headers },
    );

    if (!orderResponse.ok) {
      return json({
        ok: false,
        message: `Falha ao consultar ordem ${orderId}`,
      }, { status: 400 });
    }

    const order = await orderResponse.json();
    const shippingId = order.shipping?.id;

    if (!shippingId) {
      return json({
        ok: false,
        message: `Ordem ${orderId} não tem shipping.id`,
      }, { status: 400 });
    }

    // 2) Busca os dados reais do shipment
    console.log(`🚚 Buscando shipment ${shippingId}...`);
    const shipmentResponse = await fetch(
      `https://api.mercadolibre.com/shipments/${shippingId}`,
      { headers },
    );

    if (!shipmentResponse.ok) {
      return json({
        ok: false,
        message: `Falha ao consultar shipment ${shippingId}`,
      }, { status: 400 });
    }

    const shipment = await shipmentResponse.json();

    // 3) Extrai os dados reais de custo
    const listCost = Number(shipment.shipping_option?.list_cost || 0);
    const customerCost = Number(shipment.shipping_option?.cost || 0);
    const sellerCost = listCost - customerCost; // Custo que o vendedor paga

    console.log(`✅ Frete: Cheio R$ ${listCost}, Cliente R$ ${customerCost}, Vendedor R$ ${sellerCost}`);

    return json({
      ok: true,
      shipping_cost: sellerCost,      // Custo real que o vendedor paga
      shipping_subsidized: customerCost, // Subsídio do ML (o que cliente paga)
      list_cost: listCost,             // Frete cheio
      order_id: orderId,
      shipping_id: shippingId,
      raw_shipment: shipment.shipping_option,
    });
  } catch (error) {
    console.error("Error:", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
