import { state } from "../core/state.js";
import { showAppMessage } from "../core/dom.js";

// Inicializar estruturas de dados no state se não existirem
export function initFiscalData() {
  if (!state.fiscalDocuments) state.fiscalDocuments = [];
  if (!state.dasPayments) state.dasPayments = [];
  if (!state.purchaseInvoices) state.purchaseInvoices = [];
  if (!state.salesInvoices) state.salesInvoices = [];
}

function withOrganization(payload) {
  return state.organizationId ? { ...payload, organization_id: state.organizationId } : payload;
}

function scopeOrganization(query) {
  return state.organizationId ? query.eq("organization_id", state.organizationId) : query;
}

// FISCAL DOCUMENTS
export async function saveFiscalDocument(doc) {
  initFiscalData();

  const docData = withOrganization({
    id: doc.id || `DOC-${Date.now()}`,
    date: doc.date,
    type: doc.type,
    number: doc.number,
    description: doc.description,
    value: parseFloat(doc.value) || 0,
    status: doc.status || "Pendente",
    due_date: doc.due_date || null,
    category: doc.category || null,
    payment_method: doc.payment_method || null,
    issuer: doc.issuer || null,
    order_id: doc.order_id || null,
    product_id: doc.product_id || null,
    supplier: doc.supplier || null,
    storage_path: doc.storage_path || null,
    file_name: doc.file_name || null,
    mime_type: doc.mime_type || null,
    size_bytes: Number(doc.size_bytes || 0) || null,
    checksum_sha256: doc.checksum_sha256 || null,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  // Validar
  if (!docData.date || !docData.type || !docData.number) {
    showAppMessage("Erro", "Preencha data, tipo e número do documento.", "error");
    return false;
  }

  try {
    // Se houver Supabase, salvar lá também
    if (state.supabase) {
      const { error } = await state.supabase
        .from("fiscal_documents")
        .upsert([docData])
        .select();

      if (error) throw error;
    }

    // Salvar localmente
    const index = state.fiscalDocuments.findIndex(d => d.id === docData.id);
    if (index >= 0) {
      state.fiscalDocuments[index] = docData;
    } else {
      state.fiscalDocuments.push(docData);
    }

    showAppMessage("Sucesso", "Documento fiscal salvo com sucesso!", "success");
    return true;
  } catch (error) {
    console.error("Erro ao salvar documento:", error);
    showAppMessage("Erro", "Falha ao salvar documento. Tente novamente.", "error");
    return false;
  }
}

export async function loadFiscalDocuments(filters = {}) {
  initFiscalData();

  try {
    // Se houver Supabase, carregar de lá
    if (state.supabase) {
      let query = scopeOrganization(state.supabase.from("fiscal_documents").select("*"));

      if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("date", filters.dateTo);
      if (filters.type) query = query.eq("type", filters.type);
      if (filters.status) query = query.eq("status", filters.status);

      const { data, error } = await query.order("date", { ascending: false });

      if (!error && data) {
        state.fiscalDocuments = data;
        return data;
      }
    }

    // Retornar localmente
    let filtered = [...state.fiscalDocuments];

    if (filters.dateFrom) {
      filtered = filtered.filter(d => d.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter(d => d.date <= filters.dateTo);
    }
    if (filters.type) {
      filtered = filtered.filter(d => d.type === filters.type);
    }
    if (filters.status) {
      filtered = filtered.filter(d => d.status === filters.status);
    }

    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error("Erro ao carregar documentos:", error);
    return state.fiscalDocuments;
  }
}

export async function deleteFiscalDocument(docId) {
  initFiscalData();

  try {
    const existing = state.fiscalDocuments.find(d => d.id === docId);
    if (state.supabase) {
      let query = state.supabase.from("fiscal_documents").delete().eq("id", docId);
      query = scopeOrganization(query);
      const { error } = await query;

      if (error) throw error;
    }

    state.fiscalDocuments = state.fiscalDocuments.filter(d => d.id !== docId);
    showAppMessage("Sucesso", "Documento deletado.", "success");
    return true;
  } catch (error) {
    console.error("Erro ao deletar:", error);
    showAppMessage("Erro", "Falha ao deletar documento.", "error");
    return false;
  }
}

// DAS PAYMENTS
export async function saveDASPayment(das) {
  initFiscalData();

  const dasData = withOrganization({
    id: das.id || `DAS-${Date.now()}`,
    month: das.month,
    year: das.year,
    value: parseFloat(das.value) || 0,
    status: das.status || "Pendente",
    due_date: das.due_date,
    pix_code: das.pix_code || null,
    paid_at: das.paid_at || null,
    created_at: new Date().toISOString(),
  });

  // Validar
  if (!dasData.month || !dasData.year || dasData.value <= 0) {
    showAppMessage("Erro", "Preencha mês, ano e valor da DAS.", "error");
    return false;
  }

  try {
    if (state.supabase) {
      const { error } = await state.supabase
        .from("das_payments")
        .upsert([dasData])
        .select();

      if (error) throw error;
    }

    const index = state.dasPayments.findIndex(d => d.id === dasData.id);
    if (index >= 0) {
      state.dasPayments[index] = dasData;
    } else {
      state.dasPayments.push(dasData);
    }

    showAppMessage("Sucesso", "DAS salva com sucesso!", "success");
    return true;
  } catch (error) {
    console.error("Erro ao salvar DAS:", error);
    showAppMessage("Erro", "Falha ao salvar DAS.", "error");
    return false;
  }
}

export async function loadDASPayments(filters = {}) {
  initFiscalData();

  try {
    if (state.supabase) {
      let query = scopeOrganization(state.supabase.from("das_payments").select("*"));

      if (filters.year) query = query.eq("year", filters.year);
      if (filters.status) query = query.eq("status", filters.status);

      const { data, error } = await query.order("month", { ascending: false });

      if (!error && data) {
        state.dasPayments = data;
        return data;
      }
    }

    return state.dasPayments;
  } catch (error) {
    console.error("Erro ao carregar DAS:", error);
    return state.dasPayments;
  }
}

// PURCHASE INVOICES
export async function savePurchaseInvoice(invoice) {
  initFiscalData();

  const invoiceData = withOrganization({
    id: invoice.id || `COMP-${Date.now()}`,
    date: invoice.date,
    supplier: invoice.supplier,
    invoice_number: invoice.invoice_number,
    invoice_series: invoice.invoice_series || "",
    amount: parseFloat(invoice.amount) || 0,
    status: invoice.status || "Registrada",
    description: invoice.description || "",
    created_at: new Date().toISOString(),
  });

  // Validar
  if (!invoiceData.date || !invoiceData.supplier || !invoiceData.invoice_number) {
    showAppMessage("Erro", "Preencha data, fornecedor e número da NF.", "error");
    return false;
  }

  if (invoiceData.amount <= 0) {
    showAppMessage("Erro", "Valor deve ser maior que zero.", "error");
    return false;
  }

  try {
    if (state.supabase) {
      const { error } = await state.supabase
        .from("purchase_invoices")
        .upsert([invoiceData])
        .select();

      if (error) throw error;
    }

    const index = state.purchaseInvoices.findIndex(i => i.id === invoiceData.id);
    if (index >= 0) {
      state.purchaseInvoices[index] = invoiceData;
    } else {
      state.purchaseInvoices.push(invoiceData);
    }

    showAppMessage("Sucesso", "Nota de compra registrada!", "success");
    return true;
  } catch (error) {
    console.error("Erro ao salvar nota:", error);
    showAppMessage("Erro", "Falha ao salvar nota de compra.", "error");
    return false;
  }
}

export async function loadPurchaseInvoices(filters = {}) {
  initFiscalData();

  try {
    if (state.supabase) {
      let query = scopeOrganization(state.supabase.from("purchase_invoices").select("*"));

      if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("date", filters.dateTo);
      if (filters.supplier) query = query.ilike("supplier", `%${filters.supplier}%`);
      if (filters.status) query = query.eq("status", filters.status);

      const { data, error } = await query.order("date", { ascending: false });

      if (!error && data) {
        state.purchaseInvoices = data;
        return data;
      }
    }

    let filtered = [...state.purchaseInvoices];

    if (filters.dateFrom) {
      filtered = filtered.filter(i => i.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter(i => i.date <= filters.dateTo);
    }
    if (filters.supplier) {
      const term = filters.supplier.toLowerCase();
      filtered = filtered.filter(i => i.supplier.toLowerCase().includes(term));
    }
    if (filters.status) {
      filtered = filtered.filter(i => i.status === filters.status);
    }

    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error("Erro ao carregar notas:", error);
    return state.purchaseInvoices;
  }
}

export async function deletePurchaseInvoice(invoiceId) {
  initFiscalData();

  try {
    if (state.supabase) {
      let query = state.supabase.from("purchase_invoices").delete().eq("id", invoiceId);
      query = scopeOrganization(query);
      const { error } = await query;
      if (error) throw error;
      if (existing?.storage_path) {
        const { error: storageError } = await state.supabase.storage
          .from("fiscal-documents")
          .remove([existing.storage_path]);
        if (storageError) console.warn("Documento removido, mas o arquivo exigira limpeza posterior.", storageError);
      }
    }

    state.purchaseInvoices = state.purchaseInvoices.filter((item) => item.id !== invoiceId);
    showAppMessage("Sucesso", "Nota de compra removida.", "success");
    return true;
  } catch (error) {
    console.error("Erro ao deletar nota de compra:", error);
    showAppMessage("Erro", "Falha ao remover nota de compra.", "error");
    return false;
  }
}

// SALES INVOICES
export async function saveSalesInvoice(invoice) {
  initFiscalData();

  const invoiceData = withOrganization({
    id: invoice.id || `VENDA-${Date.now()}`,
    date: invoice.date,
    client: invoice.client,
    invoice_number: invoice.invoice_number,
    amount: parseFloat(invoice.amount) || 0,
    status: invoice.status || "Emitida",
    description: invoice.description || "",
    created_at: new Date().toISOString(),
  });

  // Validar
  if (!invoiceData.date || !invoiceData.client || !invoiceData.invoice_number) {
    showAppMessage("Erro", "Preencha data, cliente e número da NF.", "error");
    return false;
  }

  if (invoiceData.amount <= 0) {
    showAppMessage("Erro", "Valor deve ser maior que zero.", "error");
    return false;
  }

  try {
    if (state.supabase) {
      const { error } = await state.supabase
        .from("sales_invoices")
        .upsert([invoiceData])
        .select();

      if (error) throw error;
    }

    const index = state.salesInvoices.findIndex(i => i.id === invoiceData.id);
    if (index >= 0) {
      state.salesInvoices[index] = invoiceData;
    } else {
      state.salesInvoices.push(invoiceData);
    }

    showAppMessage("Sucesso", "Nota de venda registrada!", "success");
    return true;
  } catch (error) {
    console.error("Erro ao salvar nota:", error);
    showAppMessage("Erro", "Falha ao salvar nota de venda.", "error");
    return false;
  }
}

export async function loadSalesInvoices(filters = {}) {
  initFiscalData();

  try {
    if (state.supabase) {
      let query = scopeOrganization(state.supabase.from("sales_invoices").select("*"));

      if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("date", filters.dateTo);
      if (filters.client) query = query.ilike("client", `%${filters.client}%`);
      if (filters.status) query = query.eq("status", filters.status);

      const { data, error } = await query.order("date", { ascending: false });

      if (!error && data) {
        state.salesInvoices = data;
        return data;
      }
    }

    let filtered = [...state.salesInvoices];

    if (filters.dateFrom) {
      filtered = filtered.filter(i => i.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter(i => i.date <= filters.dateTo);
    }
    if (filters.client) {
      const term = filters.client.toLowerCase();
      filtered = filtered.filter(i => i.client.toLowerCase().includes(term));
    }
    if (filters.status) {
      filtered = filtered.filter(i => i.status === filters.status);
    }

    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error("Erro ao carregar notas:", error);
    return state.salesInvoices;
  }
}

export async function deleteSalesInvoice(invoiceId) {
  initFiscalData();

  try {
    if (state.supabase) {
      let query = state.supabase.from("sales_invoices").delete().eq("id", invoiceId);
      query = scopeOrganization(query);
      const { error } = await query;
      if (error) throw error;
    }

    state.salesInvoices = state.salesInvoices.filter((item) => item.id !== invoiceId);
    showAppMessage("Sucesso", "Nota de venda removida.", "success");
    return true;
  } catch (error) {
    console.error("Erro ao deletar nota de venda:", error);
    showAppMessage("Erro", "Falha ao remover nota de venda.", "error");
    return false;
  }
}

// Funções utilitárias
export function getUniqueSuppliersFromPurchases() {
  initFiscalData();
  return [...new Set(state.purchaseInvoices.map(i => i.supplier).filter(Boolean))];
}

export function getUniqueClientsFromSales() {
  initFiscalData();
  return [...new Set(state.salesInvoices.map(i => i.client).filter(Boolean))];
}

export function getTotalByMonth(month, year) {
  initFiscalData();
  const monthStr = String(month).padStart(2, "0");
  const yearStr = String(year);

  const income = state.salesInvoices
    .filter(i => i.date.startsWith(`${yearStr}-${monthStr}`))
    .reduce((sum, i) => sum + i.amount, 0);

  const expense = state.purchaseInvoices
    .filter(i => i.date.startsWith(`${yearStr}-${monthStr}`))
    .reduce((sum, i) => sum + i.amount, 0);

  return { income, expense, profit: income - expense };
}

export function getDASForYear(year) {
  initFiscalData();
  return state.dasPayments.filter(d => d.year === year);
}
