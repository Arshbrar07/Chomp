const TOKEN_MINT = 'BXRtLzupLSdS4KNLLEwondWiprU7KS7wVqLNAVqppump';
const BURN_SIGNER = '9XpUpv1yo2n1DWoQoKWr3Wx3RpihbgBku9vvZ39dm4at';
const CACHE_VERSION = 'chomp-mint-v2';

const ENDPOINT_TTLS = new Map([
  ['/api/supply', 300],
  ['/api/holders', 1800],
  ['/api/cycles', 300]
]);

function json(data, status = 200, cacheControl = 'no-store') {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function heliusRpc(apiKey, method, params) {
  const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params })
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Helius RPC failed (${response.status})`);
  }
  return payload.result;
}

async function getSupply(apiKey) {
  const result = await heliusRpc(apiKey, 'getTokenSupply', [TOKEN_MINT]);
  return {
    status: 'ok',
    mint: TOKEN_MINT,
    supply: result.value.uiAmountString,
    rawSupply: result.value.amount,
    decimals: result.value.decimals
  };
}

async function getHolders(apiKey) {
  const result = await heliusRpc(apiKey, 'getTokenAccounts', {
    mint: TOKEN_MINT,
    page: 1,
    limit: 1,
    options: { showZeroBalance: false }
  });
  return {
    status: 'ok',
    mint: TOKEN_MINT,
    holders: Number(result.total || 0)
  };
}

function burnAmountFromTransaction(transaction) {
  const looksLikeBurn = String(transaction.type || '').toUpperCase().includes('BURN') ||
    String(transaction.description || '').toLowerCase().includes('burn');

  const transferBurns = (transaction.tokenTransfers || []).filter((transfer) =>
    transfer.mint === TOKEN_MINT &&
    transfer.fromUserAccount === BURN_SIGNER &&
    !transfer.toUserAccount
  );
  if (transferBurns.length) {
    return transferBurns.reduce((sum, transfer) => sum + Math.abs(Number(transfer.tokenAmount || 0)), 0);
  }

  if (!looksLikeBurn) return 0;
  let amount = 0;
  for (const account of transaction.accountData || []) {
    for (const change of account.tokenBalanceChanges || []) {
      if (change.mint !== TOKEN_MINT || change.userAccount !== BURN_SIGNER) continue;
      const raw = Number(change.rawTokenAmount?.tokenAmount || 0);
      const decimals = Number(change.rawTokenAmount?.decimals || 0);
      if (raw < 0) amount += Math.abs(raw) / (10 ** decimals);
    }
  }
  return amount;
}

async function getCycles(apiKey) {
  const burns = [];
  let before = '';

  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ 'api-key': apiKey, limit: '100' });
    if (before) query.set('before', before);
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${BURN_SIGNER}/transactions?${query}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) throw new Error(`Helius transaction history failed (${response.status})`);
    const transactions = await response.json();
    if (!Array.isArray(transactions) || transactions.length === 0) break;

    for (const transaction of transactions) {
      const amount = burnAmountFromTransaction(transaction);
      if (amount > 0) {
        burns.push({
          signature: transaction.signature,
          amount,
          timestamp: transaction.timestamp || null
        });
      }
    }

    if (transactions.length < 100) break;
    before = transactions[transactions.length - 1]?.signature || '';
    if (!before) break;
  }

  burns.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return {
    status: 'ok',
    mint: TOKEN_MINT,
    burnSigner: BURN_SIGNER,
    cycles: burns.length,
    totalBurned: burns.reduce((sum, burn) => sum + burn.amount, 0),
    burns
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ttl = ENDPOINT_TTLS.get(url.pathname);
    if (!ttl) return json({ status: 'error', error: 'Not found' }, 404);
    if (request.method !== 'GET') return json({ status: 'error', error: 'Method not allowed' }, 405);
    if (!env.HELIUS_API_KEY) return json({ status: 'error', error: 'Live data unavailable' }, 503);

    const cache = caches.default;
    const cacheKey = new Request(`https://chomp-api-cache.internal/${CACHE_VERSION}${url.pathname}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      let payload;
      if (url.pathname === '/api/supply') payload = await getSupply(env.HELIUS_API_KEY);
      if (url.pathname === '/api/holders') payload = await getHolders(env.HELIUS_API_KEY);
      if (url.pathname === '/api/cycles') payload = await getCycles(env.HELIUS_API_KEY);

      const response = json(payload, 200, `public, max-age=60, s-maxage=${ttl}, stale-while-revalidate=${ttl}`);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: 'CHOMP live-data request failed',
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error)
      }));
      return json({ status: 'error', error: 'Live data temporarily unavailable' }, 502);
    }
  }
};
