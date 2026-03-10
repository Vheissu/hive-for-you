import type {
  ExplainResponse,
  ForYouActionRequest,
  ForYouResponse,
  PostDetailResponse,
  UserProfileView,
} from '../../../packages/shared-types/src/index';

export const defaultAccount = (import.meta.env.VITE_HIVE_ACCOUNT ?? 'beggars').trim().toLowerCase();

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error((await response.text()) || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export async function fetchFeed(options: {
  account: string;
  cursor?: string;
  pageSize?: number;
  refresh?: boolean;
}) {
  const params = new URLSearchParams({
    account: options.account,
    pageSize: String(options.pageSize ?? 12),
  });

  if (options.cursor) {
    params.set('cursor', options.cursor);
  }

  if (options.refresh) {
    params.set('refresh', 'true');
  }

  const response = await fetch(`${API_BASE}/api/for-you?${params.toString()}`);
  return readJson<ForYouResponse>(response);
}

export async function fetchProfile(account: string) {
  const response = await fetch(`${API_BASE}/api/for-you/profile?account=${account}`);
  return readJson<UserProfileView>(response);
}

export async function fetchExplanation(account: string, postKey: string) {
  const [author, permlink] = postKey.split('/');
  const response = await fetch(`${API_BASE}/api/for-you/explain/${author}/${permlink}?account=${account}`);
  return readJson<ExplainResponse>(response);
}

export async function fetchPostDetail(account: string, postKey: string) {
  const [author, permlink] = postKey.split('/');
  const response = await fetch(`${API_BASE}/api/for-you/post/${author}/${permlink}?account=${account}`);
  return readJson<PostDetailResponse>(response);
}

export async function resetPersonalization(account: string) {
  const response = await fetch(`${API_BASE}/api/for-you/reset?account=${account}`, {
    method: 'POST',
  });

  return readJson<UserProfileView>(response);
}

export async function sendAction(account: string, action: ForYouActionRequest) {
  const response = await fetch(`${API_BASE}/api/for-you/actions?account=${account}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(action),
  });

  return readJson<{ ok: true; profileVersion: number }>(response);
}

export function logAction(account: string, action: ForYouActionRequest) {
  void fetch(`${API_BASE}/api/for-you/actions?account=${account}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(action),
    keepalive: true,
  }).catch(() => undefined);
}
