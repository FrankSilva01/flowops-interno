export const REPORT_GROUPS = Object.freeze({
  overview: Object.freeze({ label: "Visão geral", reports: Object.freeze([
    Object.freeze({ key: "overview", label: "Visão geral" }),
  ]) }),
  commercial: Object.freeze({ label: "Comercial", reports: Object.freeze([
    Object.freeze({ key: "commercial", label: "Comercial" }),
    Object.freeze({ key: "clients", label: "Clientes" }),
    Object.freeze({ key: "marketplaces", label: "Marketplaces" }),
  ]) }),
  operation: Object.freeze({ label: "Operação", reports: Object.freeze([
    Object.freeze({ key: "production", label: "Produção" }),
    Object.freeze({ key: "logistics", label: "Logística" }),
    Object.freeze({ key: "products", label: "Produtos" }),
  ]) }),
  finance: Object.freeze({ label: "Financeiro", reports: Object.freeze([
    Object.freeze({ key: "financial", label: "Financeiro" }),
    Object.freeze({ key: "pricing", label: "Inteligência comercial" }),
  ]) }),
  stock: Object.freeze({ label: "Estoque", reports: Object.freeze([
    Object.freeze({ key: "materials", label: "Materiais" }),
    Object.freeze({ key: "stock", label: "Estoque" }),
    Object.freeze({ key: "quality", label: "Qualidade dos dados" }),
  ]) }),
});

export function groupForReport(tab) {
  return Object.entries(REPORT_GROUPS).find(([, group]) =>
    group.reports.some((report) => report.key === tab)
  )?.[0] || "overview";
}

export function reportsForGroup(group) {
  return (REPORT_GROUPS[group] || REPORT_GROUPS.overview).reports.map((report) => ({ ...report }));
}
