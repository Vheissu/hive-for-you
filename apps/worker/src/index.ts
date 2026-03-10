const DEFAULT_ACCOUNT = (process.env.HIVE_ACCOUNT ?? 'beggars').trim().toLowerCase();
const HIVE_RPC_URL = process.env.HIVE_RPC_URL ?? 'https://api.hive.blog';

async function rpc<T>(method: string, params: Record<string, unknown> | unknown[]) {
  const response = await fetch(HIVE_RPC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Hive RPC request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    error?: { message?: string };
    result?: T;
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? 'Hive RPC returned an error');
  }

  return payload.result as T;
}

const headState = await rpc<{ head_block_number: number; last_irreversible_block_num: number }>(
  'condenser_api.get_dynamic_global_properties',
  [],
);

console.log(
  JSON.stringify(
    {
      account: DEFAULT_ACCOUNT,
      headBlock: headState.head_block_number,
      irreversibleBlock: headState.last_irreversible_block_num,
      rpcUrl: HIVE_RPC_URL,
      status: 'idle',
      note: 'Worker entry point is reserved for future materialization jobs against live Hive data.',
    },
    null,
    2,
  ),
);

export {};
