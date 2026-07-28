import { safeUrl } from "../core/dom.js";

export function buildReferenceLibrary(orders = []) {
  return orders.flatMap((order) => {
    const common = {
      orderId: order.id,
      orderCode: order.orderCode || order.id,
      client: order.client || "Cliente n\u00e3o informado",
      title: order.description || "Encomenda sem descri\u00e7\u00e3o"
    };
    return [
      order.referenceImageUrl && { ...common, id: `${order.id}:image`, type: "image", url: safeUrl(order.referenceImageUrl) },
      order.stlLink && { ...common, id: `${order.id}:model`, type: "model", url: safeUrl(order.stlLink) }
    ].filter((asset) => asset?.url);
  });
}
