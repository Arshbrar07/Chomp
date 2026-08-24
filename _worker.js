const API_TTLS = new Map([
  ['/api/supply', 300],
  ['/api/holders', 1800],
  ['/api/cycles', 300]
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!API_TTLS.has(url.pathname)) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') {
      return Response.json({ status: 'error', error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
    }
    if (!env.SHRINK_API) {
      return Response.json({ status: 'error', error: 'Live data binding unavailable' }, { status: 503 });
    }
    const ttl = API_TTLS.get(url.pathname);
    const cache = caches.default;
    const cacheKey = new Request(`https://chomp-api-cache.internal${url.pathname}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const upstream = new Request(`https://shrink.internal${url.pathname}`, { method: 'GET', headers: { Accept: 'application/json' } });
    const response = await env.SHRINK_API.fetch(upstream);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `public, max-age=60, s-maxage=${ttl}, stale-while-revalidate=${ttl}`);
    headers.set('X-Content-Type-Options', 'nosniff');
    const result = new Response(response.body, { status: response.status, headers });
    if (response.ok) ctx.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  }
};
