export function appMessageBrand(organizationName) {
  return String(organizationName || "").trim() || "FlowOps";
}
