const API_PATHS = new Set(['/api/supply', '/api/holders', '/api/cycles']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!API_PATHS.has(url.pathname)) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') {
      return Response.json({ status: 'error', error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
    }
    if (!env.SHRINK_API) {
      return Response.json({ status: 'error', error: 'Live data binding unavailable' }, { status: 503 });
    }
    const upstream = new Request(`https://shrink.internal${url.pathname}`, { method: 'GET', headers: { Accept: 'application/json' } });
    const response = await env.SHRINK_API.fetch(upstream);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', url.pathname === '/api/holders' ? 'public, max-age=0, s-maxage=900' : 'public, max-age=0, s-maxage=60');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  }
};
