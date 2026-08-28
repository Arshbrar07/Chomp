const TOKEN_MINT = 'BXRtLzupLSdS4KNLLEwondWiprU7KS7wVqLNAVqppump';
const BURN_SIGNER = 'CiZRcErFSYUbg8nnNEz4ktRQn41D63xnLB1xYjE8i8Z1';
const CACHE_VERSION = 'chomp-mint-v7';

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
  const owners = new Set();
  const limit = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const result = await heliusRpc(apiKey, 'getTokenAccounts', {
      mint: TOKEN_MINT,
      page,
      limit,
      options: { showZeroBalance: false }
    });
    const accounts = Array.isArray(result.token_accounts) ? result.token_accounts : [];
    for (const account of accounts) {
      if (account.owner && Number(account.amount || 0) > 0) owners.add(account.owner);
    }
    if (accounts.length < limit) break;
  }

  return {
    status: 'ok',
    mint: TOKEN_MINT,
    holders: owners.size
  };
}

async function getCycles(apiKey) {
  const signatures = await heliusRpc(apiKey, 'getSignaturesForAddress', [
    BURN_SIGNER,
    { limit: 40 }
  ]);
  const burns = [];

  for (let offset = 0; offset < signatures.length; offset += 10) {
    const batch = signatures.slice(offset, offset + 10);
    const transactions = [];
    for (const entry of batch) {
      transactions.push(await heliusRpc(apiKey, 'getTransaction', [
        entry.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
      ]));
    }

    transactions.forEach((transaction, index) => {
      if (!transaction) return;
      const topLevel = transaction.transaction?.message?.instructions || [];
      const inner = (transaction.meta?.innerInstructions || []).flatMap((group) => group.instructions || []);
      let amount = 0;

      for (const instruction of [...topLevel, ...inner]) {
        const type = instruction.parsed?.type;
        const info = instruction.parsed?.info;
        if ((type !== 'burn' && type !== 'burnChecked') || info?.mint !== TOKEN_MINT) continue;
        if (info.authority && info.authority !== BURN_SIGNER) continue;
        if (info.tokenAmount?.uiAmountString != null) {
          amount += Number(info.tokenAmount.uiAmountString);
        } else if (info.amount != null) {
          amount += Number(info.amount);
        }
      }

      if (amount > 0) {
        burns.push({
          signature: batch[index].signature,
          amount,
          timestamp: transaction.blockTime || batch[index].blockTime || null
        });
      }
    });
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
