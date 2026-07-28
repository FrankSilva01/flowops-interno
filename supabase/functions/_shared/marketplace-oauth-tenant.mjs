export function marketplaceAccountLinkStatus(existingOrganizationId, requestedOrganizationId) {
  if (!existingOrganizationId) return "connected";
  return existingOrganizationId === requestedOrganizationId ? "reconnected" : "already_linked";
}
