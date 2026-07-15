import {
  adminClient,
  applyCors,
  corsHeaders,
  getMlAccountByUserId,
  importMlOrderWithRetry,
  json,
  logSync,
} from "../_shared/marketplace.ts";

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let actorEmail = "Sistema";
  let activeAction = "manual-sync";
  let activeItemId = "";
  let activeOrderId = "";
  let activeOrganizationId = "";
  try {
    const url = new URL(req.url);
    const access = await requireAdmin(req);
    actorEmail = access.email;
    activeOrganizationId = access.organizationId;
    const marketplace = url.searchParams.get("marketplace") || "ml";
    if (marketplace !== "ml") return json({ ok: false, error: "Apenas Mercado Livre nesta etapa." }, { status: 400 });

    const account = await getMlAccountByUserId(undefined, activeOrganizationId);
    const action = url.searchParams.get("action") || "sync";
    activeAction = action === "edit"
      ? "edit-listing"
      : action === "create-order"
        ? "order-import"
      : action === "sync"
        ? "manual-sync"
        : action;
    const itemId = url.searchParams.get("item_id") || "";
    activeItemId = itemId;

    if (action === "document") {
      const orderId = url.searchParams.get("order_id") || "";
      const documentType = url.searchParams.get("document_type") || "label";
      activeOrderId = orderId;
      if (!orderId) return json({ ok: false, error: "order_id obrigatorio." }, { status: 400 });
      if (!["label", "declaration", "declaration_xml"].includes(documentType)) {
        return json({ ok: false, error: "document_type invalido." }, { status: 400 });
      }
      return await downloadMlDocument(orderId, documentType, account, actorEmail);
    }

    if (action === "stats") {
      if (!itemId) return json({ ok: false, error: "item_id obrigatorio." }, { status: 400 });
      return json({ ok: true, stats: await getMlItemStats(itemId, account) });
    }

    if (action === "category-fields") {
      const categoryId = url.searchParams.get("category_id") || "";
      if (!categoryId) return json({ ok: false, error: "category_id obrigatorio." }, { status: 400 });
      return json({ ok: true, attributes: await getMlCategoryAttributes(categoryId, account) });
    }

    if (action === "create-listing") {
      if (req.method !== "POST") return json({ ok: false, error: "Use POST para criar anuncio." }, { status: 405 });
      const body = await req.json();
      const item = await createMlListing(body, account, actorEmail);
      return json({ ok: true, item });
    }

    if (action === "edit") {
      if (req.method !== "POST") return json({ ok: false, error: "Use POST para editar." }, { status: 405 });
      if (!itemId) return json({ ok: false, error: "item_id obrigatorio." }, { status: 400 });
      const changes = await req.json();
      const updated = await updateMlItem(itemId, changes, account, actorEmail);
      return json({ ok: true, item: updated });
    }

    if (action === "create-order") {
      if (req.method !== "POST") return json({ ok: false, error: "Use POST para criar a encomenda." }, { status: 405 });
      const orderId = url.searchParams.get("order_id") || "";
      activeOrderId = orderId;
      if (!orderId) return json({ ok: false, error: "order_id obrigatorio." }, { status: 400 });
      const { order: fullOrder, result, attempts } = await importMlOrderWithRetry(orderId, account);
      await logSync(
        "Mercado Livre",
        "order-import",
        result.created ? "success" : "ignored",
        result.created
          ? `Venda ${orderId} importada e vinculada a ${result.orderCode}`
          : `Venda duplicada ignorada - ja vinculada ao ${result.orderCode}`,
        {
        organizationId: activeOrganizationId,
        externalOrderId: orderId,
        internalOrderId: result.internalOrderId,
        actorEmail,
        rawPayload: { source: "manual", order: fullOrder, attempts },
        },
      );
      return json({
        ok: true,
        external_order_id: orderId,
        internal_order_id: result.internalOrderId,
        created: result.created,
      });
    }

    if (action === "analytics-full") {
      const force = url.searchParams.get("force") === "true";
      const summary = await syncAnalyticsFull(account, activeOrganizationId, actorEmail, force);
      return json({ ok: true, ...summary });
    }

    if (action === "fee-calculator") {
      if (!itemId) return json({ ok: false, error: "item_id obrigatorio." }, { status: 400 });
      const force = url.searchParams.get("force") === "true";
      const summary = await syncFeeCalculatorForItem(itemId, account, activeOrganizationId, actorEmail, force);
      return json({ ok: true, ...summary });
    }

    if (action === "fee-calculator-full") {
      const force = url.searchParams.get("force") === "true";
      const summary = await syncFeeCalculatorFull(account, activeOrganizationId, actorEmail, force);
      return json({ ok: true, ...summary });
    }

    if (action === "intent-score") {
      const force = url.searchParams.get("force") === "true";
      const summary = await syncIntentScoreQuestions(account, activeOrganizationId, actorEmail, force);
      return json({ ok: true, ...summary });
    }

    const response = await fetch("https://api.mercadolibre.com/orders/search?seller=" + account.external_seller_id + "&sort=date_desc&limit=20", {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Falha ao listar pedidos ML: ${JSON.stringify(data)}`);

    const imported = [];
    for (const row of data.results || []) {
      const orderId = String(row.id || "");
      if (!orderId) continue;
      try {
        const { order: fullOrder, result, attempts } = await importMlOrderWithRetry(orderId, account);
        imported.push({ external_order_id: orderId, internal_order_id: result.internalOrderId, created: result.created });
        await logSync("Mercado Livre", "order-import", result.created ? "success" : "ignored", result.created
          ? `Venda ${orderId} importada como ${result.orderCode}`
          : `Venda duplicada ignorada - ja vinculada ao ${result.orderCode}`, {
          externalOrderId: orderId,
          organizationId: activeOrganizationId,
          internalOrderId: result.internalOrderId,
          actorEmail,
          rawPayload: { source: "manual-sync", order_status: fullOrder.status, attempts },
        });
      } catch (error) {
        imported.push({ external_order_id: orderId, error: error.message || String(error), created: false });
        await logSync("Mercado Livre", "order-import", "error", `Venda ${orderId} nao foi importada apos 3 tentativas`, {
          organizationId: activeOrganizationId,
          externalOrderId: orderId,
          actorEmail,
          rawPayload: { source: "manual-sync", attempts: 3, error: error.message || String(error) },
        });
      }
    }

    const listingCount = await syncMlListings(account);
    await logSync("Mercado Livre", "sync-products", "success", `${listingCount} anuncio(s) sincronizado(s)`, {
      organizationId: activeOrganizationId,
      actorEmail,
      rawPayload: { listing_count: listingCount },
    });
    const createdCount = imported.filter((item) => item.created).length;
    const failedCount = imported.filter((item) => item.error).length;
    const ignoredCount = imported.length - createdCount - failedCount;
    await logSync("Mercado Livre", "manual-sync", failedCount ? "error" : "success", `${createdCount} venda(s) importada(s), ${ignoredCount} duplicada(s) ignorada(s), ${failedCount} erro(s) e ${listingCount} anuncio(s) sincronizado(s)`, {
      organizationId: activeOrganizationId,
      actorEmail,
      rawPayload: { imported, listing_count: listingCount },
    });
    return json({ ok: true, imported, listing_count: listingCount, created_count: createdCount, ignored_count: ignoredCount, failed_count: failedCount });
  } catch (error) {
    await logSync("Mercado Livre", activeAction, "error", error.message || String(error), {
      organizationId: activeOrganizationId || null,
      externalItemId: activeItemId || null,
      externalOrderId: activeOrderId || null,
      actorEmail,
      rawPayload: { error: error.message || String(error) },
    }).catch(() => {});
    return json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }
});

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Autenticacao obrigatoria.");
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user.email) throw new Error("Sessao invalida.");
  const email = data.user.email.toLowerCase();
  const requestedOrganization = new URL(req.url).searchParams.get("organization_id");
  let memberQuery = supabase
    .from("organization_members")
    .select("organization_id,role,status")
    .eq("user_email", email)
    .eq("status", "active")
    .limit(1);
  if (requestedOrganization) memberQuery = memberQuery.eq("organization_id", requestedOrganization);
  const { data: members } = await memberQuery;
  const membership = members?.[0];
  if (!membership || !["administrador", "admin", "owner"].includes(String(membership.role || "").toLowerCase())) {
    throw new Error("Apenas administrador pode gerenciar marketplaces.");
  }
  return { email, organizationId: membership.organization_id };
}

async function getMlItemStats(itemId: string, account: Record<string, any>) {
  const headers = { Authorization: `Bearer ${account.access_token}` };
  const [itemResponse, visitsResponse] = await Promise.all([
    fetch(`https://api.mercadolibre.com/items/${itemId}`, { headers }),
    fetch(`https://api.mercadolibre.com/visits/items?ids=${itemId}`, { headers }),
  ]);
  const item = await itemResponse.json();
  const visits = await visitsResponse.json();
  if (!itemResponse.ok) throw new Error(`Falha ao consultar anuncio: ${JSON.stringify(item)}`);
  return {
    item_id: itemId,
    title: item.title,
    price: item.price,
    status: item.status,
    sold_quantity: Number(item.sold_quantity || 0),
    available_quantity: Number(item.available_quantity || 0),
    visits: Number(visits?.[itemId] || 0),
    health: item.health ?? null,
    listing_type_id: item.listing_type_id,
    date_created: item.date_created,
    last_updated: item.last_updated,
    permalink: item.permalink,
  };
}

async function downloadMlDocument(
  orderId: string,
  documentType: string,
  account: Record<string, any>,
  actorEmail: string,
) {
  const supabase = adminClient();
  const { data: link, error: linkError } = await supabase
    .from("marketplace_order_links")
    .select("internal_order_id,raw_payload")
    .eq("organization_id", account.organization_id)
    .eq("marketplace", "Mercado Livre")
    .eq("external_order_id", orderId)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) throw new Error(`Venda ${orderId} nao encontrada no sistema.`);

  const { data: cachedDocument } = await supabase
    .from("marketplace_documents")
    .select("storage_path,mime_type,file_name")
    .eq("organization_id", account.organization_id)
    .eq("marketplace", "Mercado Livre")
    .eq("external_order_id", orderId)
    .eq("document_type", documentType)
    .eq("status", "available")
    .maybeSingle();
  if (cachedDocument?.storage_path) {
    const { data: cachedFile, error: cachedError } = await supabase.storage
      .from("marketplace-documents")
      .download(cachedDocument.storage_path);
    if (!cachedError && cachedFile) {
      return new Response(await cachedFile.arrayBuffer(), {
        headers: {
          ...corsHeaders,
          "Content-Type": cachedDocument.mime_type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${cachedDocument.file_name || `${documentType}-${orderId}`}"`,
          "X-FlowOps-Document-Source": "private-cache",
        },
      });
    }
  }

  const saveDocumentStatus = async (
    status: string,
    extra: Record<string, any> = {},
  ) => {
    await supabase.from("marketplace_documents").upsert({
      organization_id: account.organization_id,
      marketplace: "Mercado Livre",
      external_order_id: orderId,
      internal_order_id: link.internal_order_id,
      document_type: documentType,
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    }, { onConflict: "organization_id,marketplace,external_order_id,document_type" });
  };

  if (["declaration", "declaration_xml"].includes(documentType)) {
    return await downloadMlDce(orderId, documentType, account, actorEmail, link, saveDocumentStatus);
  }

  let shippingId = String(link.raw_payload?.shipping?.id || link.raw_payload?.shipping_id || "");
  if (!shippingId) {
    const orderResponse = await fetch(`https://api.mercadolibre.com/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
    const liveOrder = await orderResponse.json();
    if (orderResponse.ok) shippingId = String(liveOrder.shipping?.id || "");
  }
  if (!shippingId) {
    const message = "Documento ainda nao disponivel: venda sem identificador de envio.";
    await saveDocumentStatus("unavailable", { last_error: message });
    await logSync("Mercado Livre", "document-label", "ignored", message, {
      organizationId: account.organization_id,
      externalOrderId: orderId,
      internalOrderId: link.internal_order_id,
      actorEmail,
      rawPayload: { document_type: documentType },
    });
    return json({ ok: false, status: "unavailable", error: message }, { status: 409 });
  }

  const shipmentResponse = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "x-format-new": "true",
    },
  });
  const shipment = await shipmentResponse.json();
  if (!shipmentResponse.ok) throw new Error(`Falha ao consultar envio ${shippingId}: ${JSON.stringify(shipment)}`);
  const labelResponse = await fetch(
    `https://api.mercadolibre.com/shipment_labels?shipment_ids=${encodeURIComponent(shippingId)}&response_type=pdf`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  if (!labelResponse.ok) {
    const detail = await labelResponse.text();
    const message = `Mercado Livre não liberou a etiqueta para o envio ${shippingId} (${shipment.status || "-"}/${shipment.substatus || "-"}): ${detail}`;
    await saveDocumentStatus("unavailable", { external_document_id: shippingId, last_error: message, raw_payload: shipment });
    return json({ ok: false, status: "unavailable", error: message }, { status: 409 });
  }
  const bytes = await labelResponse.arrayBuffer();
  const fileName = `etiqueta-mercado-livre-${orderId}.pdf`;
  const storagePath = `${account.organization_id}/mercado-livre/${orderId}/${fileName}`;
  const { error: storageError } = await supabase.storage.from("marketplace-documents").upload(
    storagePath,
    new Blob([bytes], { type: "application/pdf" }),
    { contentType: "application/pdf", upsert: true },
  );
  if (storageError) throw new Error(`Falha ao arquivar etiqueta: ${storageError.message}`);
  await saveDocumentStatus("available", {
    external_document_id: shippingId,
    mime_type: "application/pdf",
    file_name: fileName,
    storage_path: storagePath,
    size_bytes: bytes.byteLength,
    source: "mercado-livre",
    downloaded_at: new Date().toISOString(),
    last_error: null,
    raw_payload: { shipping_id: shippingId, status: shipment.status, substatus: shipment.substatus },
  });
  await logSync("Mercado Livre", "document-label", "success", `Etiqueta baixada - venda ${orderId}`, {
    organizationId: account.organization_id,
    externalOrderId: orderId,
    internalOrderId: link.internal_order_id,
    actorEmail,
    rawPayload: { shipping_id: shippingId, file_name: fileName },
  });
  return new Response(bytes, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

async function downloadMlDce(
  orderId: string,
  documentType: string,
  account: Record<string, any>,
  actorEmail: string,
  link: Record<string, any>,
  saveDocumentStatus: (status: string, extra?: Record<string, any>) => Promise<void>,
) {
  const infoResponse = await fetch(`https://api.mercadolibre.com/mlb/order/${encodeURIComponent(orderId)}/dce/info`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const info = await infoResponse.json().catch(() => ({}));
  if (!infoResponse.ok) {
    const message = `Declaração oficial não disponível para esta venda: ${info.message || info.error || infoResponse.status}.`;
    await saveDocumentStatus("unavailable", { last_error: message, raw_payload: info });
    return json({ ok: false, status: "unavailable", error: message }, { status: 409 });
  }
  const documents = Array.isArray(info.documents) ? info.documents : [];
  const document = documents.find((item: Record<string, any>) =>
    item.dce_key && ["issued", "authorized"].includes(String(item.status || "").toLowerCase())
  ) || documents.find((item: Record<string, any>) => item.dce_key);
  if (!document?.dce_key) {
    const message = `A DC-e ainda não possui arquivo para download (${info.status || "-"}/${info.sub_status || "-"}).`;
    await saveDocumentStatus("pending", { last_error: message, raw_payload: info });
    return json({ ok: false, status: "pending", error: message }, { status: 409 });
  }
  const dceKey = String(document.dce_key);
  const fileResponse = await fetch(
    `https://api.mercadolibre.com/mlb/order/${encodeURIComponent(orderId)}/dce/info/${encodeURIComponent(dceKey)}?doctype=${documentType === "declaration_xml" ? "xml" : "pdf"}`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  if (!fileResponse.ok) {
    const detail = await fileResponse.text();
    const message = `Falha ao baixar a declaração oficial: ${detail}`;
    await saveDocumentStatus("unavailable", { external_document_id: dceKey, last_error: message, raw_payload: info });
    return json({ ok: false, status: "unavailable", error: message }, { status: 409 });
  }
  const bytes = await fileResponse.arrayBuffer();
  const extension = documentType === "declaration_xml" ? "xml" : "pdf";
  const mimeType = fileResponse.headers.get("Content-Type") || (extension === "xml" ? "application/xml" : "application/pdf");
  const fileName = `declaracao-mercado-livre-${orderId}.${extension}`;
  const storagePath = `${account.organization_id}/mercado-livre/${orderId}/${fileName}`;
  const { error: storageError } = await adminClient().storage.from("marketplace-documents").upload(
    storagePath,
    new Blob([bytes], { type: mimeType }),
    { contentType: mimeType, upsert: true },
  );
  if (storageError) throw new Error(`Falha ao arquivar DC-e: ${storageError.message}`);
  await saveDocumentStatus("available", {
    external_document_id: dceKey,
    mime_type: mimeType,
    file_name: fileName,
    storage_path: storagePath,
    size_bytes: bytes.byteLength,
    source: "mercado-livre",
    downloaded_at: new Date().toISOString(),
    last_error: null,
    raw_payload: info,
  });
  await logSync("Mercado Livre", "document-declaration", "success", `Declaração baixada - venda ${orderId}`, {
    organizationId: account.organization_id,
    externalOrderId: orderId,
    internalOrderId: link.internal_order_id,
    actorEmail,
    rawPayload: { dce_key: dceKey, file_name: fileName },
  });
  return new Response(bytes, {
    headers: {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

async function updateMlItem(itemId: string, changes: Record<string, any>, account: Record<string, any>, actorEmail: string) {
  const currentResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const current = await currentResponse.json();
  if (!currentResponse.ok) throw new Error(`Falha ao consultar anuncio atual: ${JSON.stringify(current)}`);

  const allowed: Record<string, any> = {};
  if (typeof changes.title === "string" && changes.title.trim() && changes.title.trim() !== current.title) {
    allowed.title = changes.title.trim();
  }
  if (changes.price !== undefined && Number(changes.price) > 0 && Number(changes.price) !== Number(current.price)) {
    allowed.price = Number(changes.price);
  }
  if (changes.available_quantity !== undefined && Number(changes.available_quantity) >= 0) {
    if (Number(changes.available_quantity) !== Number(current.available_quantity)) {
      allowed.available_quantity = Number(changes.available_quantity);
    }
  }
  if (["active", "paused"].includes(changes.status) && changes.status !== current.status) allowed.status = changes.status;
  if (!Object.keys(allowed).length) return current;

  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(allowed),
  });
  const item = await response.json();
  if (!response.ok) {
    const detail = `${item.message || ""} ${JSON.stringify(item.cause || [])}`;
    if (/unauthorized|policy/i.test(detail)) {
      throw new Error(
        "Mercado Livre recusou a edicao porque a conta esta conectada com Publicacao e sincronizacao em somente leitura. Altere para leitura e escrita no ML Developers e conecte a conta novamente.",
      );
    }
    throw new Error(item.message || JSON.stringify(item));
  }

  const supabase = adminClient();
  await supabase.from("marketplace_listings").update({
    title: item.title || changes.title,
    price: Number(item.price || changes.price || 0),
    status: item.status || changes.status,
    raw_payload: item,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", account.organization_id).eq("marketplace", "Mercado Livre").eq("external_id", itemId);
  await logSync("Mercado Livre", "edit-listing", "success", `Anuncio ${itemId} atualizado`, {
    organizationId: account.organization_id,
    externalItemId: itemId,
    actorEmail,
    rawPayload: {
      before: {
        title: current.title,
        price: current.price,
        available_quantity: current.available_quantity,
        status: current.status,
      },
      after: {
        title: item.title,
        price: item.price,
        available_quantity: item.available_quantity,
        status: item.status,
      },
      changes: allowed,
    },
  });
  return item;
}

async function getMlCategoryAttributes(categoryId: string, account: Record<string, any>) {
  const response = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/attributes`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao buscar campos da categoria: ${JSON.stringify(data)}`);
  return data;
}

async function fetchMlDescription(itemId: string, account: Record<string, any>) {
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return "";
  return data.plain_text || data.text || "";
}

async function createMlListing(body: Record<string, any>, account: Record<string, any>, actorEmail: string) {
  const pictures = Array.isArray(body.pictures)
    ? body.pictures.map((source: string) => ({ source })).filter((item) => item.source)
    : [];
  if (!body.title) throw new Error("Titulo obrigatorio para publicar no Mercado Livre.");
  if (!body.category_id) throw new Error("Categoria ML obrigatoria.");
  if (!Number(body.price)) throw new Error("Preco obrigatorio.");
  if (!pictures.length) throw new Error("Informe pelo menos uma imagem para publicar no Mercado Livre.");
  const payload: Record<string, any> = {
    title: String(body.title).trim(),
    category_id: String(body.category_id).trim(),
    price: Number(body.price),
    currency_id: "BRL",
    available_quantity: Number(body.available_quantity || 1),
    buying_mode: "buy_it_now",
    condition: body.condition || "new",
    listing_type_id: body.listing_type_id || "gold_special",
    pictures,
    attributes: Array.isArray(body.attributes) ? body.attributes : [],
    sale_terms: [],
  };
  if (body.warranty) {
    payload.sale_terms.push({ id: "WARRANTY_TYPE", value_name: String(body.warranty) });
  }
  if (body.manufacturing_time) {
    payload.sale_terms.push({ id: "MANUFACTURING_TIME", value_name: String(body.manufacturing_time) });
  }
  if (body.sku) payload.seller_custom_field = String(body.sku);

  const response = await fetch("https://api.mercadolibre.com/items", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const item = await response.json();
  if (!response.ok) {
    throw new Error(item.message || JSON.stringify(item.cause || item));
  }

  if (body.description) {
    await fetch(`https://api.mercadolibre.com/items/${item.id}/description`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plain_text: String(body.description) }),
    }).catch(() => {});
  }

  const description = body.description || await fetchMlDescription(String(item.id), account);
  const supabase = adminClient();
  await supabase.from("marketplace_listings").upsert({
    organization_id: account.organization_id,
    marketplace: "Mercado Livre",
    external_id: String(item.id),
    title: item.title || payload.title,
    sku: item.seller_custom_field || body.sku || null,
    price: Number(item.price || body.price || 0),
    status: item.status || "active",
    permalink: item.permalink || null,
    thumbnail_url: item.thumbnail || pictures[0].source || null,
    raw_payload: { ...item, description, pictures: item.pictures || pictures },
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,marketplace,external_id" });
  await logSync("Mercado Livre", "create-listing", "success", `Anuncio ${item.id} criado`, {
    organizationId: account.organization_id,
    externalItemId: String(item.id),
    actorEmail,
    rawPayload: { request: payload, item },
  });
  return item;
}

async function syncMlListings(account: Record<string, any>) {
  const response = await fetch(`https://api.mercadolibre.com/users/${account.external_seller_id}/items/search?limit=50`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao listar anuncios ML: ${JSON.stringify(data)}`);

  const supabase = adminClient();
  let importedCount = 0;
  for (const itemId of data.results || []) {
    const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
    const item = await itemResponse.json();
    if (!itemResponse.ok) continue;
    const description = await fetchMlDescription(itemId, account);
    await supabase.from("marketplace_listings").upsert({
      organization_id: account.organization_id,
      marketplace: "Mercado Livre",
      external_id: String(item.id),
      title: item.title || "",
      sku: item.seller_custom_field || null,
      price: Number(item.price || 0),
      status: item.status || null,
      permalink: item.permalink || null,
      thumbnail_url: item.thumbnail || null,
      raw_payload: { ...item, description },
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,marketplace,external_id" });
    await syncMlReviews(itemId, account).catch(() => {});
    importedCount += 1;
  }
  return importedCount;
}

async function syncMlReviews(itemId: string, account: Record<string, any>) {
  const response = await fetch(`https://api.mercadolibre.com/reviews/item/${itemId}`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  if (!response.ok) return 0;
  const data = await response.json();
  const supabase = adminClient();
  let count = 0;
  for (const review of data.reviews || []) {
    const externalId = String(review.id || `${itemId}-${review.date_created || count}`);
    const { error } = await supabase.from("marketplace_reviews").upsert({
      organization_id: account.organization_id,
      marketplace: "Mercado Livre",
      external_product_id: itemId,
      external_review_id: externalId,
      rating: Number(review.rate || review.rating || 0),
      title: review.title || null,
      comment: review.content || review.comment || null,
      author_name: review.reviewer.nickname || review.reviewer.name || null,
      review_date: review.date_created || review.created_at || null,
      raw_payload: review,
      updated_at: new Date().toISOString(),
    }, { onConflict: "marketplace,external_review_id" });
    if (!error) count += 1;
  }
  if (data.rating_average || data.total) {
    const { data: listing } = await supabase.from("marketplace_listings")
      .select("raw_payload").eq("organization_id", account.organization_id).eq("marketplace", "Mercado Livre").eq("external_id", itemId).maybeSingle();
    await supabase.from("marketplace_listings").update({
      raw_payload: {
        ...(listing.raw_payload || {}),
        rating_average: Number(data.rating_average || 0),
        rating_count: Number(data.total || data.paging.total || count),
      },
      updated_at: new Date().toISOString(),
    }).eq("organization_id", account.organization_id).eq("marketplace", "Mercado Livre").eq("external_id", itemId);
  }
  return count;
}

// --- Inteligencia Comercial: centro de comando (analytics-full) ---
// Cada sub-busca e isolada (try/catch propria) - se uma falhar, as outras
// continuam e o campo correspondente fica null ("nao disponivel"), nunca
// inventamos numero. Cache: 1h pra visitas/vendas/saude/frete, 6h pra
// competitividade/posicao de busca/tendencias (mais caras/sujeitas a rate
// limit). "force=true" ignora os dois caches.

const ONE_HOUR_MS = 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * ONE_HOUR_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function syncAnalyticsFull(
  account: Record<string, any>,
  organizationId: string,
  actorEmail: string,
  force: boolean,
) {
  const supabase = adminClient();
  const { data: listings, error: listingsError } = await supabase
    .from("marketplace_listings")
    .select("id,external_id,marketplace,title,price,raw_payload")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre");
  if (listingsError) throw listingsError;

  const results: Array<Record<string, unknown>> = [];
  const trendCacheByCategory = new Map<string, Record<string, unknown> | null>();

  for (const listing of listings || []) {
    try {
      const snapshot = await getListingAnalyticsSnapshot(listing, account, force, trendCacheByCategory);
      if (snapshot) {
        const { error: insertError } = await supabase.from("listing_analytics").insert({
          organization_id: organizationId,
          listing_id: listing.id || null,
          external_id: listing.external_id,
          marketplace: "Mercado Livre",
          ...snapshot,
        });
        if (insertError) throw insertError;
        results.push({ external_id: listing.external_id, ok: true, skipped: false });
      } else {
        results.push({ external_id: listing.external_id, ok: true, skipped: true });
      }
    } catch (error) {
      results.push({ external_id: listing.external_id, ok: false, error: error.message || String(error) });
    }
  }

  let reputation: Record<string, unknown> | null = null;
  try {
    reputation = await getSellerReputation(account, organizationId, force);
  } catch (error) {
    reputation = { ok: false, error: error.message || String(error) };
  }

  const okCount = results.filter((item) => item.ok && !item.skipped).length;
  const skippedCount = results.filter((item) => item.skipped).length;
  const failedCount = results.filter((item) => !item.ok).length;
  await logSync(
    "Mercado Livre",
    "analytics-full",
    failedCount ? "error" : "success",
    `${okCount} anuncio(s) atualizado(s), ${skippedCount} dentro do cache, ${failedCount} erro(s). Reputacao: ${reputation && reputation.ok === false ? "falhou" : "ok"}.`,
    {
      organizationId,
      actorEmail,
      rawPayload: { results, reputation },
    },
  );

  return {
    synced_at: new Date().toISOString(),
    listings: results,
    reputation,
  };
}

async function getListingAnalyticsSnapshot(
  listing: Record<string, any>,
  account: Record<string, any>,
  force: boolean,
  trendCacheByCategory: Map<string, Record<string, unknown> | null>,
) {
  const supabase = adminClient();
  const { data: lastRow } = await supabase
    .from("listing_analytics")
    .select("*")
    .eq("organization_id", account.organization_id)
    .eq("marketplace", "Mercado Livre")
    .eq("external_id", listing.external_id)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ageMs = lastRow ? Date.now() - new Date(lastRow.synced_at).getTime() : Infinity;
  if (!force && lastRow && ageMs < ONE_HOUR_MS) return null;
  const refreshCompetition = force || !lastRow || ageMs >= SIX_HOURS_MS;

  const headers = { Authorization: `Bearer ${account.access_token}` };
  const itemResponse = await fetch(`https://api.mercadolibre.com/items/${listing.external_id}`, { headers });
  const item = await itemResponse.json();
  if (!itemResponse.ok) throw new Error(`Falha ao consultar anuncio ${listing.external_id}: ${JSON.stringify(item)}`);

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 30 * 24 * ONE_HOUR_MS);

  const [visits, healthChecklist, shipping] = await Promise.all([
    getVisitsTimeWindow(listing.external_id, account).catch(() => null),
    estimateHealthChecklist(item, account).catch(() => null),
    getShippingCosts(listing.external_id, item, account).catch(() => null),
  ]);

  let competitionFields: Record<string, unknown> = {
    price_position_avg: lastRow ? lastRow.price_position_avg : null,
    price_position_median: lastRow ? lastRow.price_position_median : null,
    price_position_min: lastRow ? lastRow.price_position_min : null,
    price_position_max: lastRow ? lastRow.price_position_max : null,
    price_competitiveness: lastRow ? lastRow.price_competitiveness : null,
    search_position: lastRow ? lastRow.search_position : null,
  };
  let trend: Record<string, unknown> | null = trendCacheByCategory.has(item.category_id)
    ? trendCacheByCategory.get(item.category_id) || null
    : (lastRow && lastRow.raw_summary
        ? { keywords: lastRow.raw_summary.trend_keywords, highlighted: lastRow.raw_summary.category_highlighted }
        : null);

  if (refreshCompetition) {
    const [priceStats, searchPosition, categoryTrend] = await Promise.all([
      getCategoryPriceStats(item.category_id, Number(item.price || listing.price || 0), account).catch(() => null),
      getSearchPosition(item.title, listing.external_id, account).catch(() => null),
      trendCacheByCategory.has(item.category_id)
        ? Promise.resolve(trendCacheByCategory.get(item.category_id) || null)
        : getCategoryTrends(item.category_id, listing.external_id, account).catch(() => null),
    ]);
    if (priceStats) Object.assign(competitionFields, priceStats);
    competitionFields.search_position = searchPosition;
    trendCacheByCategory.set(item.category_id, categoryTrend);
    trend = categoryTrend;
  }

  const visitsTotal = visits ? visits.total_visits : (lastRow ? lastRow.visits : 0) || 0;
  const soldQuantity = Number(item.sold_quantity || 0);
  const conversionRate = visitsTotal > 0 ? (soldQuantity / visitsTotal) * 100 : null;
  const revenue = Number(item.price || 0) * soldQuantity;

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    visits: visitsTotal,
    sold_quantity: soldQuantity,
    conversion_rate: conversionRate,
    revenue,
    avg_ticket: soldQuantity > 0 ? revenue / soldQuantity : null,
    price_position_avg: competitionFields.price_position_avg ?? null,
    price_position_median: competitionFields.price_position_median ?? null,
    price_position_min: competitionFields.price_position_min ?? null,
    price_position_max: competitionFields.price_position_max ?? null,
    price_competitiveness: competitionFields.price_competitiveness ?? null,
    search_position: competitionFields.search_position ?? null,
    category_trend: null,
    health_score: item.health ?? null,
    health_checklist: healthChecklist,
    raw_summary: {
      visits_series: visits ? visits.results : null,
      shipping,
      trend_keywords: trend ? trend.keywords : null,
      category_highlighted: trend ? Boolean(trend.highlighted) : null,
    },
    synced_at: new Date().toISOString(),
  };
}

// Documentado e estavel na API publica do ML.
async function getVisitsTimeWindow(itemId: string, account: Record<string, any>) {
  const response = await fetch(
    `https://api.mercadolibre.com/items/${itemId}/visits/time_window?last=30&unit=day`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao consultar visitas: ${JSON.stringify(data)}`);
  return { total_visits: Number(data.total_visits || 0), results: data.results || [] };
}

// --- Bloco 1.B: taxas reais por anuncio (fee-calculator) ---
// Cache 6h (mesma faixa dos dados mais caros/sujeitos a rate limit em
// syncAnalyticsFull) - "force=true" ignora o cache. Nunca inventamos valor:
// se a API nao devolver o dado, os campos ficam 0/null e o front mostra
// "estimado" em vez de "sincronizado" (ver resolveListingFeeInfo em
// pricing.js). Usa o endpoint oficial de simulacao de precos do ML
// (/sites/MLB/listing_prices) - a fonte real da comissao (% + taxa fixa)
// pro preco/categoria/tipo de anuncio atual, em vez de uma tabela estimada.

async function getListingFeeSyncSnapshot(itemId: string, account: Record<string, any>, force: boolean) {
  const supabase = adminClient();
  const { data: lastRow } = await supabase
    .from("listing_fee_sync")
    .select("*")
    .eq("organization_id", account.organization_id)
    .eq("marketplace", "Mercado Livre")
    .eq("external_id", itemId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ageMs = lastRow ? Date.now() - new Date(lastRow.synced_at).getTime() : Infinity;
  if (!force && lastRow && ageMs < SIX_HOURS_MS) return null;

  const headers = { Authorization: `Bearer ${account.access_token}` };
  const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, { headers });
  const item = await itemResponse.json();
  if (!itemResponse.ok) throw new Error(`Falha ao consultar anuncio ${itemId}: ${JSON.stringify(item)}`);

  const priceParams = new URLSearchParams({
    price: String(item.price || 0),
    listing_type_id: String(item.listing_type_id || "gold_special"),
  });
  if (item.category_id) priceParams.set("category_id", item.category_id);
  const priceResponse = await fetch(`https://api.mercadolibre.com/sites/MLB/listing_prices?${priceParams.toString()}`, { headers });
  const priceData = await priceResponse.json();
  const priceInfo = Array.isArray(priceData) ? priceData[0] : priceData;
  if (!priceResponse.ok || !priceInfo) throw new Error(`Falha ao consultar taxas de ${itemId}: ${JSON.stringify(priceData)}`);

  const shipping = await getShippingCosts(itemId, item, account).catch(() => null);
  const freeShipping = Boolean(item.shipping?.free_shipping);
  // O custo de frete so pesa na margem do vendedor quando o anuncio tem
  // frete gratis (o vendedor absorve o custo) - se o comprador paga o
  // frete, isso nao afeta a margem do vendedor. Quando ha frete gratis,
  // avg_seller_cost ja e o valor liquido que o vendedor paga de fato
  // (senders[0].cost em /shipments/costs) - o Mercado Livre cobre a
  // diferenca ate o valor cheio (avg_gross_cost) em boa parte dos casos de
  // vendedores com bom nivel/reputacao. shipping_subsidized guarda essa
  // diferenca pra fins de auditoria/exibicao; o que de fato entra na
  // margem e sempre o custo liquido do vendedor.
  const sellerShippingCost = freeShipping ? Number(shipping?.avg_seller_cost || 0) : 0;
  const grossShippingCost = freeShipping ? Number(shipping?.avg_gross_cost ?? shipping?.avg_seller_cost ?? 0) : 0;
  const shippingSubsidized = Math.max(grossShippingCost - sellerShippingCost, 0);

  const price = Number(item.price || 0);
  const saleFeeAmount = Number(priceInfo.sale_fee_amount || 0);
  const feeDetails = priceInfo.sale_fee_details || {};
  const fixedFeeReal = Number(feeDetails.fixed_fee || 0);
  const percentageFeeReal = feeDetails.percentage_fee != null
    ? Number(feeDetails.percentage_fee)
    : (price > 0 ? ((saleFeeAmount - fixedFeeReal) / price) * 100 : 0);

  return {
    listing_type_id: item.listing_type_id || null,
    category_id: item.category_id || null,
    price,
    real_fee_pct: percentageFeeReal,
    real_fee_fixed: fixedFeeReal,
    // shipping_cost guarda sempre o custo que o VENDEDOR paga de verdade
    // (ja descontado o subsídio do ML). shipping_subsidized guarda quanto
    // foi coberto pelo ML pra auditoria, mas nao entra no calculo de margem.
    shipping_cost: sellerShippingCost,
    shipping_subsidized: shippingSubsidized,
    free_shipping: freeShipping,
    raw_payload: { price_info: priceInfo, shipping },
    synced_at: new Date().toISOString(),
  };
}

async function syncFeeCalculatorForItem(
  itemId: string,
  account: Record<string, any>,
  organizationId: string,
  actorEmail: string,
  force: boolean,
) {
  const supabase = adminClient();
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id,external_id")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre")
    .eq("external_id", itemId)
    .maybeSingle();
  const snapshot = await getListingFeeSyncSnapshot(itemId, account, force);
  if (!snapshot) {
    await logSync("Mercado Livre", "fee-calculator", "success", `Taxas de ${itemId} dentro do cache (6h), nao sincronizado de novo.`, {
      organizationId, externalItemId: itemId, actorEmail,
    });
    return { external_id: itemId, skipped: true };
  }
  const { error: insertError } = await supabase.from("listing_fee_sync").insert({
    organization_id: organizationId,
    listing_id: listing?.id || null,
    external_id: itemId,
    marketplace: "Mercado Livre",
    ...snapshot,
  });
  if (insertError) throw insertError;
  await logSync("Mercado Livre", "fee-calculator", "success", `Taxas reais de ${itemId} sincronizadas.`, {
    organizationId, externalItemId: itemId, actorEmail, rawPayload: snapshot,
  });
  return { external_id: itemId, skipped: false, snapshot };
}

async function syncFeeCalculatorFull(
  account: Record<string, any>,
  organizationId: string,
  actorEmail: string,
  force: boolean,
) {
  const supabase = adminClient();
  const { data: listings, error: listingsError } = await supabase
    .from("marketplace_listings")
    .select("id,external_id")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre");
  if (listingsError) throw listingsError;

  const results: Array<Record<string, unknown>> = [];
  for (const listing of listings || []) {
    try {
      const result = await syncFeeCalculatorForItem(listing.external_id, account, organizationId, actorEmail, force);
      results.push({ external_id: listing.external_id, ok: true, skipped: Boolean(result.skipped) });
    } catch (error) {
      results.push({ external_id: listing.external_id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const okCount = results.filter((item) => item.ok && !item.skipped).length;
  const skippedCount = results.filter((item) => item.skipped).length;
  const failedCount = results.filter((item) => !item.ok).length;
  await logSync(
    "Mercado Livre", "fee-calculator-full", failedCount ? "error" : "success",
    `${okCount} anuncio(s) com taxa sincronizada, ${skippedCount} dentro do cache, ${failedCount} erro(s).`,
    { organizationId, actorEmail, rawPayload: { results } },
  );
  return { synced_at: new Date().toISOString(), listings: results };
}

// --- Bloco 2: perguntas recentes por anuncio (score de intencao) ---
// Cache 1h (mesma faixa de visitas/vendas em syncAnalyticsFull). Anexa
// questions_total/questions_unanswered na linha mais recente de
// listing_analytics (excecao deliberada ao padrao "so insert" dessa tabela -
// perguntas tem ciclo de cache proprio e nao vale reduplicar visitas/
// conversao so pra isso).

async function getQuestionsCountForItem(itemId: string, account: Record<string, any>) {
  const response = await fetch(
    `https://api.mercadolibre.com/questions/search?item=${itemId}&status=UNANSWERED,ANSWERED&limit=50`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao consultar perguntas de ${itemId}: ${JSON.stringify(data)}`);
  const cutoff = Date.now() - 30 * 24 * ONE_HOUR_MS;
  const questions = (data.questions || []).filter((question: Record<string, any>) => {
    const when = new Date(question.date_created || 0).getTime();
    return when >= cutoff;
  });
  const unanswered = questions.filter((question: Record<string, any>) => question.status === "UNANSWERED").length;
  return { total: questions.length, unanswered };
}

async function syncIntentScoreQuestions(
  account: Record<string, any>,
  organizationId: string,
  actorEmail: string,
  force: boolean,
) {
  const supabase = adminClient();
  const { data: listings, error: listingsError } = await supabase
    .from("marketplace_listings")
    .select("id,external_id")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre");
  if (listingsError) throw listingsError;

  const results: Array<Record<string, unknown>> = [];
  for (const listing of listings || []) {
    try {
      const { data: lastRow } = await supabase
        .from("listing_analytics")
        .select("id,synced_at")
        .eq("organization_id", organizationId)
        .eq("marketplace", "Mercado Livre")
        .eq("external_id", listing.external_id)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ageMs = lastRow ? Date.now() - new Date(lastRow.synced_at).getTime() : Infinity;
      if (!lastRow) {
        // Sem snapshot de analytics ainda pra anexar as perguntas - rode
        // "Sincronizar" na aba Inteligencia primeiro.
        results.push({ external_id: listing.external_id, ok: true, skipped: true });
        continue;
      }
      if (!force && ageMs < ONE_HOUR_MS) {
        results.push({ external_id: listing.external_id, ok: true, skipped: true });
        continue;
      }
      const questions = await getQuestionsCountForItem(listing.external_id, account);
      const { error: updateError } = await supabase
        .from("listing_analytics")
        .update({ questions_total: questions.total, questions_unanswered: questions.unanswered })
        .eq("id", lastRow.id);
      if (updateError) throw updateError;
      results.push({ external_id: listing.external_id, ok: true, skipped: false, questions });
    } catch (error) {
      results.push({ external_id: listing.external_id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const okCount = results.filter((item) => item.ok && !item.skipped).length;
  const skippedCount = results.filter((item) => item.skipped).length;
  const failedCount = results.filter((item) => !item.ok).length;
  await logSync(
    "Mercado Livre", "intent-score", failedCount ? "error" : "success",
    `${okCount} anuncio(s) com perguntas atualizadas, ${skippedCount} dentro do cache ou sem analytics, ${failedCount} erro(s).`,
    { organizationId, actorEmail, rawPayload: { results } },
  );
  return { synced_at: new Date().toISOString(), listings: results };
}

// A API publica do ML nao documenta um endpoint dedicado de "checklist de
// qualidade" por anuncio - o que existe de fato e o score numerico "health"
// (ja capturado em /items/{id}, sem chamada extra). O checklist abaixo e
// heuristico, estimado a partir de dados que a API ja devolve - marcado
// como "estimado" na UI, nao como um dado oficial do ML.
async function estimateHealthChecklist(item: Record<string, any>, account: Record<string, any>) {
  const description = await fetchMlDescription(String(item.id), account).catch(() => "");
  return {
    fotos: Array.isArray(item.pictures) && item.pictures.length >= 3,
    descricao: String(description || "").length >= 200,
    ficha_tecnica: Array.isArray(item.attributes) && item.attributes.filter((attr: any) => attr.value_name || attr.value_id).length >= 5,
    video: Boolean(item.video_id),
  };
}

// Publico, nao exige token de vendedor especifico - mas mandamos o header
// mesmo assim por consistencia/contabilizacao de rate limit.
async function getCategoryPriceStats(categoryId: string, userPrice: number, account: Record<string, any>) {
  if (!categoryId) return null;
  const response = await fetch(
    `https://api.mercadolibre.com/sites/MLB/search?category=${categoryId}&sort=price_asc&limit=50`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao consultar precos da categoria: ${JSON.stringify(data)}`);
  const prices = (data.results || []).map((row: any) => Number(row.price || 0)).filter((price: number) => price > 0);
  if (!prices.length) return null;
  const avg = prices.reduce((sum: number, price: number) => sum + price, 0) / prices.length;
  const band = avg * 0.1;
  const competitiveness = userPrice > avg + band ? "above" : userPrice < avg - band ? "below" : "average";
  // Guardamos so o resumo estatistico - nunca a lista de precos dos concorrentes.
  return {
    price_position_avg: avg,
    price_position_median: median(prices),
    price_position_min: Math.min(...prices),
    price_position_max: Math.max(...prices),
    price_competitiveness: competitiveness,
  };
}

async function getSearchPosition(title: string, itemId: string, account: Record<string, any>) {
  const query = encodeURIComponent(String(title || "").slice(0, 60));
  const response = await fetch(
    `https://api.mercadolibre.com/sites/MLB/search?q=${query}&limit=50`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao consultar posicao de busca: ${JSON.stringify(data)}`);
  const index = (data.results || []).findIndex((row: any) => String(row.id) === String(itemId));
  return index >= 0 ? index + 1 : null;
}

// A API do ML nao garante o mesmo formato de /shipments/costs pra toda
// conta/categoria de envio - por isso sempre garantimos ao menos o dado
// basico (frete gratis sim/nao), que ja vem no proprio /items/{id}, e
// tratamos o calculo por CEP como um extra que pode nao estar disponivel.
const SHIPPING_REFERENCE_ZIPS: Record<string, string> = { SP: "01310100", RJ: "20040020", BH: "30130010" };

// /shipments/costs devolve o custo bruto do frete (gross_amount) e, quando
// ha frete gratis, o valor que o VENDEDOR de fato paga vem em senders[0].cost
// (o Mercado Livre ou o proprio anuncio - via bonificacao de reputacao/nivel -
// cobre a diferenca ate o gross_amount). Sem isso, o custo de frete ficava
// zerado sempre que o item tinha frete gratis, o que subestimava o custo real
// do vendedor. costs_by_city guarda o custo REAL do vendedor por cidade
// (usado tambem no drawer de diagnostico do anuncio); gross_costs_by_city
// guarda o valor cheio, usado so pra calcular o quanto foi subsidiado.
async function getShippingCosts(itemId: string, item: Record<string, any>, account: Record<string, any>) {
  const freeShipping = Boolean(item.shipping && item.shipping.free_shipping);
  const costsByCity: Record<string, number | null> = {};
  const grossCostsByCity: Record<string, number | null> = {};
  for (const city of Object.keys(SHIPPING_REFERENCE_ZIPS)) {
    const zip = SHIPPING_REFERENCE_ZIPS[city];
    try {
      const response = await fetch(
        `https://api.mercadolibre.com/shipments/costs?item_id=${itemId}&zip_code=${zip}`,
        { headers: { Authorization: `Bearer ${account.access_token}` } },
      );
      const data = await response.json();
      if (!response.ok) {
        costsByCity[city] = null;
        grossCostsByCity[city] = null;
        continue;
      }
      const grossAmount = Number(data.gross_amount ?? data.cost ?? 0);
      const senderCost = Array.isArray(data.senders) && data.senders.length
        ? Number(data.senders[0]?.cost ?? grossAmount)
        : Number(data.cost ?? grossAmount);
      costsByCity[city] = senderCost;
      grossCostsByCity[city] = grossAmount;
    } catch {
      costsByCity[city] = null;
      grossCostsByCity[city] = null;
    }
  }
  const price = Number(item.price || 0);
  const knownCosts = Object.values(costsByCity).filter((value): value is number => value !== null);
  const knownGrossCosts = Object.values(grossCostsByCity).filter((value): value is number => value !== null);
  const avgSellerCost = knownCosts.length ? knownCosts.reduce((sum, value) => sum + value, 0) / knownCosts.length : null;
  const avgGrossCost = knownGrossCosts.length ? knownGrossCosts.reduce((sum, value) => sum + value, 0) / knownGrossCosts.length : null;
  const shippingSharePct = avgSellerCost != null && price > 0 ? (avgSellerCost / price) * 100 : null;
  return {
    free_shipping: freeShipping,
    costs_by_city: costsByCity,
    gross_costs_by_city: grossCostsByCity,
    avg_seller_cost: avgSellerCost,
    avg_gross_cost: avgGrossCost,
    shipping_share_pct: shippingSharePct,
  };
}

async function getSellerReputation(account: Record<string, any>, organizationId: string, force: boolean) {
  const supabase = adminClient();
  const { data: existing } = await supabase
    .from("seller_metrics")
    .select("synced_at")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre")
    .maybeSingle();
  const ageMs = existing ? Date.now() - new Date(existing.synced_at).getTime() : Infinity;
  if (!force && existing && ageMs < ONE_DAY_MS) return { ok: true, skipped: true };

  const response = await fetch(`https://api.mercadolibre.com/users/${account.external_seller_id}`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao consultar reputacao: ${JSON.stringify(data)}`);
  const reputation = data.seller_reputation || {};
  const metrics = reputation.metrics || {};
  const payload = {
    organization_id: organizationId,
    marketplace: "Mercado Livre",
    seller_level: reputation.level_id || null,
    claims_rate: Number((metrics.claims && metrics.claims.rate) || 0) * 100,
    delayed_rate: Number((metrics.delayed_handling_time && metrics.delayed_handling_time.rate) || 0) * 100,
    cancellation_rate: Number((metrics.cancellations && metrics.cancellations.rate) || 0) * 100,
    total_sales: Number((reputation.transactions && reputation.transactions.total) || 0),
    raw_payload: reputation,
    synced_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("seller_metrics").upsert(payload, { onConflict: "organization_id,marketplace" });
  if (error) throw error;
  return { ok: true, skipped: false, ...payload };
}

// /highlights nao e garantido pra toda categoria - degrada sem quebrar o resto.
// Nao inventamos uma direcao de tendencia (up/down) sem um sinal real: a API
// de trends devolve so termos ranqueados, sem volume numerico, entao nao da
// pra calcular "cresceu X%" de forma honesta. category_trend fica null (nao
// "stable") ate existir um jeito confiavel de comparar. O sinal real que
// conseguimos expor e se o proprio anuncio aparece nos destaques da categoria.
async function getCategoryTrends(categoryId: string, itemId: string, account: Record<string, any>) {
  if (!categoryId) return null;
  const headers = { Authorization: `Bearer ${account.access_token}` };
  const [trendsResponse, highlightsResult] = await Promise.all([
    fetch(`https://api.mercadolibre.com/trends/MLB/${categoryId}`, { headers }),
    fetch(`https://api.mercadolibre.com/highlights/MLB/${categoryId}`, { headers }).catch(() => null),
  ]);
  const trends = trendsResponse.ok ? await trendsResponse.json() : [];
  const keywords = Array.isArray(trends) ? trends.slice(0, 10).map((row: any) => row.keyword).filter(Boolean) : [];
  let highlighted = false;
  if (highlightsResult && highlightsResult.ok) {
    const highlights = await highlightsResult.json().catch(() => null);
    const list = Array.isArray(highlights) ? highlights
      : Array.isArray((highlights as any)?.content) ? (highlights as any).content
      : Array.isArray((highlights as any)?.items) ? (highlights as any).items
      : [];
    highlighted = list.some((entry: any) => {
      const id = typeof entry === "string" ? entry : entry?.id || entry?.item_id;
      return String(id) === String(itemId);
    });
  }
  return { category_trend: null, keywords, highlighted };
}
