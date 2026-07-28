export function isMissingMercadoPagoPlan(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error?.statusDetail || "").toLowerCase();
  return (status === 400 || status === 404)
    && ((message.includes("template") && message.includes("does not exist"))
      || (message.includes("preapproval") && (message.includes("not found") || message.includes("does not exist"))));
}
