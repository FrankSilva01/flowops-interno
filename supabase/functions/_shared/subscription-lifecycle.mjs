const APPROVED_PAYMENT_STATUSES = new Set([
  "approved",
  "authorized",
  "paid",
  "processed",
  "accredited",
]);

const DECLINED_PAYMENT_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "refunded",
  "charged_back",
]);

export function normalizePaymentStatus(value) {
  const status = String(value || "pending").trim().toLowerCase();
  if (APPROVED_PAYMENT_STATUSES.has(status)) return "approved";
  if (DECLINED_PAYMENT_STATUSES.has(status)) {
    return status === "cancelled" || status === "canceled" ? "cancelled" : "rejected";
  }
  return status === "in_process" ? "pending" : status;
}

export function normalizeProviderSubscriptionStatus(value) {
  return ({
    authorized: "active",
    pending: "pending",
    paused: "paused",
    cancelled: "cancelled",
    canceled: "cancelled",
  })[String(value || "").trim().toLowerCase()] || "pending";
}

export function derivePaymentTransition({
  currentStatus = "pending",
  paymentStatus,
  attemptedAt,
  currentGraceEndsAt = null,
  nextPaymentAt = null,
}) {
  const status = normalizePaymentStatus(paymentStatus);
  const timestamp = attemptedAt || new Date().toISOString();

  if (status === "approved") {
    return {
      paymentStatus: status,
      subscriptionStatus: "active",
      organizationStatus: "active",
      paidAt: timestamp,
      graceEndsAt: null,
      nextPaymentAt,
    };
  }

  if (status === "rejected" || status === "cancelled") {
    const graceEndsAt = currentGraceEndsAt
      || new Date(new Date(timestamp).getTime() + 5 * 86400000).toISOString();
    return {
      paymentStatus: status,
      subscriptionStatus: "past_due",
      organizationStatus: "pending",
      paidAt: null,
      graceEndsAt,
      nextPaymentAt,
    };
  }

  const subscriptionStatus = currentStatus === "active" ? "active" : "pending";
  return {
    paymentStatus: status,
    subscriptionStatus,
    organizationStatus: subscriptionStatus === "active" ? "active" : "pending",
    paidAt: null,
    graceEndsAt: currentGraceEndsAt,
    nextPaymentAt,
  };
}
