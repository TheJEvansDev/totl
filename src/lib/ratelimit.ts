// Simple per-IP limit to protect free API quotas. Per server instance only.

export function createLimiter(maxPerWindow: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return function limited(req: Request): boolean {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > maxPerWindow;
  };
}
