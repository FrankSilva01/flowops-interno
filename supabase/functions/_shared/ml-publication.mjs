// Retry only an explicit validation rejection: successful/ambiguous requests
// must never be repeated, as doing so could create duplicate listings.
export async function postMlListing(payload, accessToken, fetcher = fetch) {
  const send = (body) => fetcher('https://api.mercadolibre.com/items', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const response = await send(payload);
  if (response.status !== 400 || payload.family_name || !payload.title) return response;
  const error = await response.clone().json().catch(() => ({}));
  const messages = [error.message, ...(Array.isArray(error.cause) ? error.cause.map(c => c.message) : [])];
  const requiresFamily = messages.some(message =>
    typeof message === 'string' && /family_name/i.test(message) &&
    /does not contain|missing|required|obrigat/i.test(message));
  if (!requiresFamily) return response;
  const { title, ...rest } = payload;
  return send({ ...rest, family_name: String(title).trim() });
}
