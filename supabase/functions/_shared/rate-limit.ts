type SupabaseAdmin = { from: (table: string) => any };

export async function enforceRateLimit(
  supabase: SupabaseAdmin,
  key: string,
  limit: number,
  windowMinutes: number,
) {
  const now = Date.now();
  const windowStart = new Date(now).toISOString();
  const resetBefore = new Date(now - windowMinutes * 60_000).toISOString();
  const safeKey = key.slice(0, 220);

  const { data } = await supabase
    .from("security_rate_limits")
    .select("key,count,window_start")
    .eq("key", safeKey)
    .maybeSingle();

  if (!data || String(data.window_start || "") < resetBefore) {
    await supabase.from("security_rate_limits").upsert({
      key: safeKey,
      count: 1,
      window_start: windowStart,
      updated_at: windowStart,
    });
    return;
  }

  if (Number(data.count || 0) >= limit) {
    throw new Error("Muitas tentativas recentes. Aguarde alguns minutos e tente novamente.");
  }

  await supabase
    .from("security_rate_limits")
    .update({ count: Number(data.count || 0) + 1, updated_at: windowStart })
    .eq("key", safeKey);
}
