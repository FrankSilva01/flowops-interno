import {
  adminClient,
  applyCors,
  corsHeaders,
  json,
  logSync,
} from "../_shared/marketplace.ts";

const FOCUS_NFE_BASE_URL = "https://api.focusnfe.com.br/v2";

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "sync";
    const organizationId = url.searchParams.get("organization_id");

    if (!organizationId) {
      return json({ ok: false, error: "organization_id obrigatorio" }, { status: 400 });
    }

    const supabase = adminClient();

    // Buscar credenciais da organização
    const { data: org, error: orgError } = await supabase
      .from("organization_settings")
      .select("nfe_api_key,nfe_cnpj,nfe_name")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (orgError || !org?.nfe_api_key) {
      return json({ ok: false, error: "NF-e nao configurada" }, { status: 400 });
    }

    if (action === "sync") {
      return await syncNFe(organizationId, org.nfe_api_key, org.nfe_cnpj, supabase);
    }

    if (action === "get-danfe") {
      const invoiceId = url.searchParams.get("invoice_id");
      if (!invoiceId) return json({ ok: false, error: "invoice_id obrigatorio" }, { status: 400 });
      return await getDanfePdf(organizationId, invoiceId, org.nfe_api_key, supabase);
    }

    return json({ ok: false, error: "Action invalida" }, { status: 400 });
  } catch (error) {
    console.error("NF-e sync error:", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});

async function syncNFe(
  organizationId: string,
  apiKey: string,
  cnpj: string,
  supabase: any
) {
  console.log(`Sincronizando NF-e para ${cnpj}...`);

  // Buscar últimas notas emitidas
  const response = await fetch(`${FOCUS_NFE_BASE_URL}/nfes_list?cnpj=${cnpj}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Focus NFe API error: ${error}`);
  }

  const data = await response.json();
  const nfes = data.data || [];

  let syncedCount = 0;

  for (const nfe of nfes) {
    // Verificar se já existe
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("external_id", nfe.id)
      .maybeSingle();

    if (existing) continue;

    // Salvar nova NF-e
    const { error: insertError } = await supabase.from("invoices").insert({
      organization_id: organizationId,
      external_id: nfe.id,
      number: nfe.numero,
      series: nfe.serie,
      nf_key: nfe.chave_acesso,
      status: nfe.status || "pending",
      issuer_name: nfe.razao_social || "",
      issuer_cnpj: cnpj,
      issued_at: nfe.data_emissao,
      danfe_url: nfe.danfe_url || null,
      raw_payload: nfe,
      synced_at: new Date().toISOString(),
    });

    if (!insertError) {
      syncedCount += 1;

      // Vincular a pedidos se possível (por data/cliente)
      await linkInvoiceToPedidos(organizationId, nfe, supabase);
    }
  }

  await logSync("NF-e", "sync", "success", `${syncedCount} NF-e sincronizadas`, {
    organizationId,
    cnpj,
    count: syncedCount,
  });

  return json({ ok: true, synced: syncedCount, total: nfes.length });
}

async function linkInvoiceToPedidos(organizationId: string, nfe: any, supabase: any) {
  // Buscar pedidos sem NF-e no intervalo de tempo
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("organization_id", organizationId)
    .is("invoice_id", null)
    .gte("created_at", new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString())
    .limit(5);

  if (!orders?.length) return;

  // Vincular ao primeiro pedido disponível (heurística)
  await supabase
    .from("orders")
    .update({ invoice_id: nfe.id })
    .eq("id", orders[0].id);
}

async function getDanfePdf(
  organizationId: string,
  invoiceId: string,
  apiKey: string,
  supabase: any
) {
  // Buscar invoice
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("external_id", invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    return json({ ok: false, error: "Invoice nao encontrada" }, { status: 404 });
  }

  if (!invoice.danfe_url) {
    // Buscar da API
    const response = await fetch(`${FOCUS_NFE_BASE_URL}/nfes/${invoiceId}?cnpj=${invoice.issuer_cnpj}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return json({ ok: false, error: "DANFE nao disponivel" }, { status: 404 });
    }

    const nfeData = await response.json();
    const danfeUrl = nfeData.data?.danfe_url;

    if (danfeUrl) {
      // Atualizar URL no banco
      await supabase
        .from("invoices")
        .update({ danfe_url: danfeUrl })
        .eq("id", invoice.id);

      // Retornar PDF
      const pdfResponse = await fetch(danfeUrl);
      return new Response(await pdfResponse.arrayBuffer(), {
        headers: { "Content-Type": "application/pdf" },
      });
    }
  }

  // Retornar DANFE já salvo
  const pdfResponse = await fetch(invoice.danfe_url);
  return new Response(await pdfResponse.arrayBuffer(), {
    headers: { "Content-Type": "application/pdf" },
  });
}
