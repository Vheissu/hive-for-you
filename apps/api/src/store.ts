import { randomUUID } from 'node:crypto';

import { algorithmVersion, forYouConfig, lowSignalTags } from '../../../packages/shared-config/src/index';
import {
  applyDirectSignal,
  buildCandidateFeatures,
  createEmptyProfile,
  isHardFiltered,
  isExcludedAuthor,
  mergeCandidates,
  rerankWithDiversity,
  scoreCandidate,
  toExplainResponse,
  toFeedItem,
  toRankedFeedItem,
} from '../../../packages/ranking-core/src/index';
import type {
  CommentItem,
  ExplainResponse,
  FeedSnapshot,
  ForYouActionRequest,
  ForYouResponse,
  InteractionEvent,
  NormalizedPost,
  PostDetailResponse,
  PreferenceOverrides,
  UserProfile,
  UserProfileView,
} from '../../../packages/shared-types/src/index';

const DEFAULT_ACCOUNT = (process.env.HIVE_ACCOUNT ?? 'beggars').trim().toLowerCase();
const HIVE_RPC_URL = process.env.HIVE_RPC_URL ?? 'https://api.hive.blog';
const FEED_WINDOW_HOURS = 48;
const PROFILE_SEED_HOURS = 24 * 14;
const PROFILE_VOTE_LOOKBACK_DAYS = 45;
const PROFILE_VOTE_LIMIT = 18;
const ACCOUNT_HISTORY_PAGE_SIZE = 250;
const ACCOUNT_HISTORY_MAX_PAGES = 6;
const HIVE_BLOCK_SECONDS = 3;
type BridgeVote = {
  rshares?: number | string;
  voter?: string;
};

type HistoryVoteOperation = {
  author?: string;
  permlink?: string;
  voter?: string;
  weight?: number | string;
};

type AccountHistoryEntry = {
  block: number;
  timestamp: string;
  op: [string, unknown];
};

type RecentVoteSignal = {
  blockNumber: number;
  post: NormalizedPost;
  weight: number;
};

type BridgePost = {
  active_votes?: BridgeVote[];
  author: string;
  author_reputation?: number;
  body: string;
  category?: string;
  children?: number;
  community?: string | null;
  community_title?: string | null;
  created: string;
  depth?: number;
  json_metadata?: unknown;
  payout?: number;
  pending_payout_value?: string;
  permlink: string;
  reblogged_by?: string[];
  reblogs?: number;
  stats?: {
    flag_weight?: number;
    gray?: boolean;
    hide?: boolean;
    total_votes?: number;
  };
  title: string;
  url?: string;
};

type FeedDiagnostics = {
  account: string;
  algorithmVersion: string;
  profileVersion: number;
  headBlock: number;
  sourceCounts: Record<string, number>;
  filteredCount: number;
  duplicateCount: number;
  topAuthors: string[];
  topCommunities: string[];
};

function emptyOverrides(): PreferenceOverrides {
  return {
    hiddenPosts: new Set<string>(),
    suppressedAuthors: new Set<string>(),
    suppressedTags: new Set<string>(),
    suppressedCommunities: new Set<string>(),
    boostedAuthors: new Set<string>(),
    boostedTags: new Set<string>(),
    boostedCommunities: new Set<string>(),
  };
}

function encodeCursor(snapshotId: string, offset: number) {
  return Buffer.from(JSON.stringify({ snapshotId, offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string) {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      offset: number;
      snapshotId: string;
    };

    if (typeof parsed.snapshotId !== 'string' || typeof parsed.offset !== 'number') {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function parsePendingPayout(raw?: string) {
  if (!raw) {
    return undefined;
  }

  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseJsonMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }

  return {};
}

function normalizeAppName(raw: unknown) {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  return normalized.split('/')[0] ?? normalized;
}

function stripMarkdown(body: string) {
  return body
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPreview(body: string) {
  return body.length > 220 ? `${body.slice(0, 217)}...` : body;
}

function extractTags(post: BridgePost) {
  const metadata = parseJsonMetadata(post.json_metadata);
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (tags.length > 0) {
    return [...new Set(tags)];
  }

  return post.category ? [String(post.category).trim().toLowerCase()] : [];
}

function deriveFormat(post: { body: string; image?: string; tags: string[]; title: string; app?: string }) {
  const bodyLength = post.body.length;
  const hasImage = Boolean(post.image);
  const lowerTags = new Set(post.tags.map((tag) => tag.toLowerCase()));
  const isVideo = lowerTags.has('video') || lowerTags.has('3speak') || post.app?.includes('3speak') || false;
  const isLinkPost = /https?:\/\//.test(post.body) && bodyLength < 800;

  return {
    imageHeavy: hasImage && bodyLength < 4_000,
    longform: bodyLength >= 4_000,
    discussion: bodyLength < 2_500 && post.title.trim().endsWith('?'),
    linkPost: isLinkPost,
    video: isVideo,
  };
}

function toCreatedBlock(createdAt: string, headBlock: number) {
  const created = new Date(createdAt);

  if (Number.isNaN(created.getTime())) {
    return headBlock;
  }

  const secondsAgo = Math.max((Date.now() - created.getTime()) / 1000, 0);
  return Math.max(headBlock - Math.round(secondsAgo / HIVE_BLOCK_SECONDS), 0);
}

function detectUserVote(votes: BridgeVote[], observer?: string): 'up' | 'down' | undefined {
  if (!observer) return undefined;
  const match = votes.find((v) => v.voter?.trim().toLowerCase() === observer);
  if (!match) return undefined;
  const rshares = Number(match.rshares ?? 0);
  if (rshares > 0) return 'up';
  if (rshares < 0) return 'down';
  return undefined;
}

function normalizeBridgePost(post: BridgePost, headBlock: number, observer?: string): NormalizedPost {
  const metadata = parseJsonMetadata(post.json_metadata);
  const tags = extractTags(post);
  const images = Array.isArray(metadata.image)
    ? metadata.image.map((image) => String(image)).filter(Boolean)
    : Array.isArray(metadata.images)
      ? metadata.images.map((image) => String(image)).filter(Boolean)
      : [];
  const cleanBody = stripMarkdown(post.body ?? '');
  const votes = post.active_votes ?? [];
  const positiveVotes = votes.filter((vote) => Number(vote.rshares ?? 0) >= 0).length || post.stats?.total_votes || 0;
  const negativeVotes = votes.filter((vote) => Number(vote.rshares ?? 0) < 0).length;
  const app = normalizeAppName(metadata.app);
  const language = typeof metadata.lang === 'string' ? metadata.lang : 'en';
  const community = post.community ?? (post.category ? String(post.category) : undefined);
  const createdBlock = toCreatedBlock(post.created, headBlock);

  return {
    postKey: `${post.author}/${post.permlink}`,
    author: post.author,
    permlink: post.permlink,
    rootKey: `${post.author}/${post.permlink}`,
    depth: post.depth ?? 0,
    community: community ?? undefined,
    tags,
    title: post.title,
    body: cleanBody,
    bodyPreview: buildPreview(cleanBody),
    image: images[0],
    app,
    language,
    createdAt: post.created,
    createdBlock,
    userVoted: detectUserVote(votes, observer),
    format: deriveFormat({
      body: cleanBody,
      image: images[0],
      tags,
      title: post.title,
      app,
    }),
    stats: {
      positiveVotes,
      negativeVotes,
      children: post.children ?? 0,
      netRshares: undefined,
      pendingPayout: typeof post.payout === 'number' ? post.payout : parsePendingPayout(post.pending_payout_value),
      authorReputation: post.author_reputation,
      hide: post.stats?.hide ?? false,
      gray: post.stats?.gray ?? false,
      promoted: 0,
    },
  };
}

function toPostDetail(raw: BridgePost, normalized: NormalizedPost, comments: CommentItem[] = []): PostDetailResponse {
  return {
    postKey: normalized.postKey,
    author: normalized.author,
    permlink: normalized.permlink,
    title: normalized.title,
    body: normalized.body,
    rawBody: raw.body,
    bodyPreview: normalized.bodyPreview,
    community: normalized.community,
    tags: normalized.tags,
    image: normalized.image,
    app: normalized.app,
    language: normalized.language,
    createdAt: raw.created,
    url: raw.url ? `https://peakd.com${raw.url}` : `https://peakd.com/@${normalized.author}/${normalized.permlink}`,
    userVoted: normalized.userVoted,
    stats: normalized.stats,
    comments,
  };
}

function isRecent(createdAt: string, hours: number) {
  const created = new Date(createdAt).getTime();

  if (!Number.isFinite(created)) {
    return false;
  }

  return Date.now() - created <= hours * 60 * 60 * 1000;
}

function sortByCreated(posts: NormalizedPost[]) {
  return [...posts].sort((left, right) => right.createdBlock - left.createdBlock);
}

function takeUnique(posts: NormalizedPost[], limit: number) {
  const seen = new Set<string>();
  const result: NormalizedPost[] = [];

  for (const post of posts) {
    if (seen.has(post.postKey)) {
      continue;
    }

    seen.add(post.postKey);
    result.push(post);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function topRecentAuthors(posts: NormalizedPost[], account: string, limit: number) {
  const counts = posts.reduce<Record<string, number>>((accumulator, post) => {
    if (post.author === account) {
      return accumulator;
    }

    accumulator[post.author] = (accumulator[post.author] ?? 0) + post.stats.positiveVotes + post.stats.children + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([author]) => author);
}

function isUsefulTag(tag: string) {
  return tag.length > 1 && !lowSignalTags.has(tag) && !tag.startsWith('hive-');
}

class HiveBridgeRepository {
  private async rpc<T>(method: string, params: Record<string, unknown> | unknown[]) {
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

  public async getHeadState() {
    const result = await this.rpc<{ head_block_number: number; last_irreversible_block_num: number }>(
      'condenser_api.get_dynamic_global_properties',
      [],
    );

    return {
      headBlock: result.head_block_number,
      irreversibleBlock: result.last_irreversible_block_num,
    };
  }

  public async getFeedPosts(account: string, limit: number, headBlock: number, observer?: string) {
    const posts = await this.rpc<BridgePost[]>('bridge.get_account_posts', {
      account,
      sort: 'feed',
      start_author: '',
      start_permlink: '',
      limit,
    });

    return posts
      .filter((post) => isRecent(post.created, FEED_WINDOW_HOURS))
      .map((post) => normalizeBridgePost(post, headBlock, observer))
      .slice(0, limit);
  }

  public async getAuthoredPosts(account: string, limit: number, headBlock: number) {
    const posts = await this.rpc<BridgePost[]>('bridge.get_account_posts', {
      account,
      sort: 'posts',
      start_author: '',
      start_permlink: '',
      limit,
    });

    return posts
      .filter((post) => isRecent(post.created, PROFILE_SEED_HOURS))
      .map((post) => normalizeBridgePost(post, headBlock));
  }

  public async getPostsByAuthors(authors: string[], limitPerAuthor: number, headBlock: number, observer?: string) {
    const settled = await Promise.allSettled(
      authors.map((author) =>
        this.rpc<BridgePost[]>('bridge.get_account_posts', {
          account: author,
          sort: 'posts',
          start_author: '',
          start_permlink: '',
          limit: limitPerAuthor,
        }),
      ),
    );

    return settled
      .flatMap((item) => (item.status === 'fulfilled' ? item.value : []))
      .filter((post) => isRecent(post.created, FEED_WINDOW_HOURS))
      .map((post) => normalizeBridgePost(post, headBlock, observer));
  }

  public async getRankedPosts(sort: 'created' | 'hot', observer: string, limit: number, tag = '') {
    const { headBlock } = await this.getHeadState();
    const normalizedLimit = Math.max(limit, 1);
    const seen = new Set<string>();
    const results: NormalizedPost[] = [];
    let startAuthor = '';
    let startPermlink = '';

    for (let page = 0; page < 4 && results.length < normalizedLimit; page += 1) {
      const posts = await this.rpc<BridgePost[]>('bridge.get_ranked_posts', {
        sort,
        tag,
        observer,
        start_author: startAuthor,
        start_permlink: startPermlink,
        limit: Math.min(20, normalizedLimit),
      });

      if (!posts.length) {
        break;
      }

      for (const post of posts) {
        const postKey = `${post.author}/${post.permlink}`;

        if (!isRecent(post.created, FEED_WINDOW_HOURS) || seen.has(postKey)) {
          continue;
        }

        seen.add(postKey);
        results.push(normalizeBridgePost(post, headBlock, observer));

        if (results.length >= normalizedLimit) {
          break;
        }
      }

      const lastPost = posts[posts.length - 1];

      if (!lastPost || posts.length < 20) {
        break;
      }

      startAuthor = lastPost.author;
      startPermlink = lastPost.permlink;
    }

    return results.slice(0, normalizedLimit);
  }

  public async getRawPost(author: string, permlink: string, observer: string) {
    return this.rpc<BridgePost>('bridge.get_post', {
      author,
      permlink,
      observer,
    });
  }

  public async getDiscussion(author: string, permlink: string): Promise<CommentItem[]> {
    const discussion = await this.rpc<Record<string, BridgePost>>('bridge.get_discussion', {
      author,
      permlink,
    });

    if (!discussion) return [];

    const rootKey = `${author}/${permlink}`;
    return Object.values(discussion)
      .filter((post) => `${post.author}/${post.permlink}` !== rootKey && (post.depth ?? 0) > 0)
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
      .map((post) => ({
        author: post.author,
        body: post.body,
        createdAt: post.created,
        depth: (post.depth ?? 1) - 1,
        votes: post.active_votes?.filter((v) => Number(v.rshares ?? 0) >= 0).length ?? 0,
        children: post.children ?? 0,
      }));
  }

  public async getRecentVoteSignals(account: string, headBlock: number, maxVotes: number, lookbackDays: number) {
    const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    const votes: Array<{ author: string; blockNumber: number; permlink: string; weight: number }> = [];
    const seenPostKeys = new Set<string>();
    let start = -1;

    for (let page = 0; page < ACCOUNT_HISTORY_MAX_PAGES && votes.length < maxVotes; page += 1) {
      const history = await this.rpc<Array<[number, AccountHistoryEntry]>>('condenser_api.get_account_history', [
        account,
        start,
        ACCOUNT_HISTORY_PAGE_SIZE,
      ]);

      if (!Array.isArray(history) || history.length === 0) {
        break;
      }

      let reachedCutoff = false;

      for (const [, entry] of [...history].reverse()) {
        const timestampMs = Date.parse(entry.timestamp);

        if (!Number.isFinite(timestampMs) || timestampMs < cutoffMs) {
          reachedCutoff = true;
          continue;
        }

        if (entry.op[0] !== 'vote') {
          continue;
        }

        const operation = entry.op[1] as HistoryVoteOperation;
        const voter = String(operation.voter ?? '').trim().toLowerCase();
        const author = String(operation.author ?? '').trim().toLowerCase();
        const permlink = String(operation.permlink ?? '').trim();
        const weight = Number(operation.weight ?? 0);

        if (!voter || voter !== account || !author || !permlink || !Number.isFinite(weight) || weight === 0) {
          continue;
        }

        if (author === account) {
          continue;
        }

        const postKey = `${author}/${permlink}`;

        if (seenPostKeys.has(postKey)) {
          continue;
        }

        seenPostKeys.add(postKey);
        votes.push({
          author,
          permlink,
          weight,
          blockNumber: entry.block || headBlock,
        });

        if (votes.length >= maxVotes) {
          break;
        }
      }

      const oldestSequence = history[0]?.[0];
      const oldestTimestamp = Date.parse(history[0]?.[1].timestamp ?? '');

      if (
        reachedCutoff ||
        oldestSequence === undefined ||
        oldestSequence <= 0 ||
        (Number.isFinite(oldestTimestamp) && oldestTimestamp < cutoffMs)
      ) {
        break;
      }

      start = oldestSequence - 1;
    }

    if (votes.length === 0) {
      return [] as RecentVoteSignal[];
    }

    const settled = await Promise.allSettled(
      votes.map((vote) => this.getRawPost(vote.author, vote.permlink, account)),
    );

    return votes.flatMap((vote, index) => {
      const result = settled[index];

      if (result?.status !== 'fulfilled') {
        return [];
      }

      return [
        {
          blockNumber: vote.blockNumber,
          weight: vote.weight,
          post: normalizeBridgePost(result.value, headBlock),
        },
      ];
    });
  }
}

export class ForYouService {
  private readonly hive = new HiveBridgeRepository();
  private readonly profiles = new Map<string, UserProfile>();
  private readonly overrides = new Map<string, PreferenceOverrides>();
  private readonly seen = new Map<string, Set<string>>();
  private readonly snapshots = new Map<string, FeedSnapshot>();
  private readonly explanations = new Map<string, Map<string, ExplainResponse>>();
  private readonly interactions: InteractionEvent[] = [];
  private readonly diagnostics = new Map<string, FeedDiagnostics>();

  private getOverrides(account: string) {
    const existing = this.overrides.get(account);

    if (existing) {
      return existing;
    }

    const created = emptyOverrides();
    this.overrides.set(account, created);
    return created;
  }

  private getSeen(account: string) {
    const existing = this.seen.get(account);

    if (existing) {
      return existing;
    }

    const created = new Set<string>();
    this.seen.set(account, created);
    return created;
  }

  private async seedProfile(account: string) {
    const { headBlock } = await this.hive.getHeadState();
    let profile = createEmptyProfile(account, headBlock);
    const [feedPosts, authoredPosts, votedPosts] = await Promise.all([
      this.hive.getFeedPosts(account, 25, headBlock).catch(() => []),
      this.hive.getAuthoredPosts(account, 12, headBlock).catch(() => []),
      this.hive
        .getRecentVoteSignals(account, headBlock, PROFILE_VOTE_LIMIT, PROFILE_VOTE_LOOKBACK_DAYS)
        .catch(() => [] as RecentVoteSignal[]),
    ]);

    for (const vote of votedPosts) {
      profile = applyDirectSignal(
        profile,
        vote.weight > 0 ? 'positive_vote' : 'negative_vote',
        vote.blockNumber,
        vote.post,
      );
    }

    for (const post of sortByCreated(feedPosts).slice(0, 8)) {
      profile = applyDirectSignal(profile, 'open_post', headBlock, post);
    }

    for (const post of sortByCreated(authoredPosts).slice(0, 10)) {
      profile = applyDirectSignal(profile, 'comment', headBlock, post);
    }

    profile.topAuthors = profile.topAuthors.filter((entry) => entry.key !== account && !isExcludedAuthor(entry.key));
    profile.sourceBlock = headBlock;
    profile.profileVersion = 1;
    this.profiles.set(account, profile);

    return profile;
  }

  private async getOrSeedProfile(account: string) {
    return this.profiles.get(account) ?? this.seedProfile(account);
  }

  private async safeSource<T>(factory: () => Promise<T>, fallback: T) {
    try {
      return await factory();
    } catch {
      return fallback;
    }
  }

  private async collectSourceBatches(account: string, profile: UserProfile, headBlock: number) {
    const feedPosts = await this.safeSource(() => this.hive.getFeedPosts(account, 40, headBlock, account), []);
    const topTags = profile.topTags
      .filter((entry) => entry.score > 0 && isUsefulTag(entry.key))
      .slice(0, 4)
      .map((entry) => entry.key);
    const topCommunities = new Set(
      profile.topCommunities
        .filter((entry) => entry.score > 0)
        .slice(0, 4)
        .map((entry) => entry.key),
    );
    const explicitAuthorSeeds = profile.topAuthors
      .filter((entry) => entry.score > 0)
      .slice(0, 8)
      .map((entry) => entry.key);
    const recentAuthorBackfill = explicitAuthorSeeds.length >= 4 ? [] : topRecentAuthors(feedPosts, account, 4);
    const authorSeeds = [...new Set([...explicitAuthorSeeds, ...recentAuthorBackfill])]
      .filter((author) => author !== account && !isExcludedAuthor(author))
      .slice(0, 8);

    const [authorPosts, hotByTags, createdByTags, globalHot, globalCreated] = await Promise.all([
      this.safeSource(() => this.hive.getPostsByAuthors(authorSeeds, 6, headBlock, account), []),
      Promise.all(topTags.map((tag) => this.safeSource(() => this.hive.getRankedPosts('hot', account, 18, tag), []))),
      Promise.all(topTags.map((tag) => this.safeSource(() => this.hive.getRankedPosts('created', account, 18, tag), []))),
      this.safeSource(() => this.hive.getRankedPosts('hot', account, 36), []),
      this.safeSource(() => this.hive.getRankedPosts('created', account, 36), []),
    ]);

    const tagPosts = takeUnique([...hotByTags.flat(), ...createdByTags.flat()], 80);
    const communityPosts = takeUnique(
      [...globalHot, ...globalCreated, ...tagPosts].filter((post) => post.community && topCommunities.has(post.community)),
      48,
    );

    return {
      followed_authors: feedPosts,
      engaged_authors: authorPosts,
      favorite_tags: tagPosts,
      favorite_communities: communityPosts,
      conversation_context: [] as NormalizedPost[],
      reblogs_by_strong_connections: [] as NormalizedPost[],
      similar_users: [] as NormalizedPost[],
      global_exploration: globalCreated,
      global_quality: globalHot,
    } as const;
  }

  private paginateSnapshot(snapshot: FeedSnapshot, pageSize: number, offset = 0): ForYouResponse {
    const normalizedPageSize = Math.min(Math.max(pageSize, 1), forYouConfig.pageSizeMax);
    const items = snapshot.items.slice(offset, offset + normalizedPageSize).map(toFeedItem);
    const nextOffset = offset + normalizedPageSize;

    return {
      snapshotId: snapshot.id,
      profileVersion: snapshot.profileVersion,
      headBlock: snapshot.headBlock,
      nextCursor: nextOffset < snapshot.items.length ? encodeCursor(snapshot.id, nextOffset) : undefined,
      items,
    };
  }

  private invalidateSnapshots(account: string) {
    this.snapshots.delete(account);
    this.explanations.delete(account);
  }

  private updateProfile(account: string, updater: (current: UserProfile) => UserProfile) {
    const current = this.profiles.get(account);

    if (!current) {
      return;
    }

    const next = updater(current);
    next.profileVersion = current.profileVersion + 1;
    this.profiles.set(account, next);
  }

  public async buildFeed(account = DEFAULT_ACCOUNT, options: { cursor?: string; pageSize?: number; refresh?: boolean }) {
    const normalizedAccount = account.trim().toLowerCase() || DEFAULT_ACCOUNT;
    const pageSize = options.pageSize ?? forYouConfig.pageSizeDefault;
    const decodedCursor = decodeCursor(options.cursor);
    const profile = await this.getOrSeedProfile(normalizedAccount);
    const { headBlock } = await this.hive.getHeadState();
    const existingSnapshot = this.snapshots.get(normalizedAccount);

    if (decodedCursor && existingSnapshot && existingSnapshot.id === decodedCursor.snapshotId) {
      return this.paginateSnapshot(existingSnapshot, pageSize, decodedCursor.offset);
    }

    if (
      !options.refresh &&
      existingSnapshot &&
      existingSnapshot.profileVersion === profile.profileVersion &&
      Math.abs(headBlock - existingSnapshot.headBlock) <= forYouConfig.snapshotReuseBlockDrift
    ) {
      return this.paginateSnapshot(existingSnapshot, pageSize, 0);
    }

    const sourceBatches = await this.collectSourceBatches(normalizedAccount, profile, headBlock);
    const merged = mergeCandidates(
      sourceBatches,
      new Map<string, string[]>(),
    )
      .filter((entry) => entry.post.author !== normalizedAccount)
      .sort((left, right) => right.post.createdBlock - left.post.createdBlock);
    const duplicateCount = Object.values(sourceBatches).flat().length - merged.length;
    const overrides = this.getOverrides(normalizedAccount);
    const seen = this.getSeen(normalizedAccount);
    const filtered = merged.filter((entry) => !isHardFiltered(entry.post, overrides, seen, profile.settings.includeNsfw));
    const authorCounts = filtered.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry.post.author] = (accumulator[entry.post.author] ?? 0) + 1;
      return accumulator;
    }, {});

    const scored = filtered
      .map((entry) => {
        const features = buildCandidateFeatures(entry, profile, overrides, seen, headBlock, authorCounts[entry.post.author] ?? 0);
        return {
          ...entry,
          features,
          score: scoreCandidate(features),
        };
      })
      .filter((entry) => entry.features.qualityScore >= forYouConfig.minimumQualityScore)
      .sort((left, right) => right.score - left.score);

    const reranked = rerankWithDiversity(scored);
    const snapshot: FeedSnapshot = {
      id: randomUUID(),
      account: normalizedAccount,
      profileVersion: profile.profileVersion,
      headBlock,
      createdBlock: headBlock,
      items: reranked.map(toRankedFeedItem),
    };

    this.snapshots.set(normalizedAccount, snapshot);
    this.explanations.set(
      normalizedAccount,
      new Map(
        reranked.map((entry) => [
          entry.post.postKey,
          toExplainResponse(entry.post.postKey, entry.features.contributions, entry.sourceSet),
        ]),
      ),
    );
    this.diagnostics.set(normalizedAccount, {
      account: normalizedAccount,
      algorithmVersion,
      profileVersion: profile.profileVersion,
      headBlock,
      sourceCounts: Object.fromEntries(Object.entries(sourceBatches).map(([source, posts]) => [source, posts.length])),
      filteredCount: filtered.length,
      duplicateCount,
      topAuthors: [...new Set(snapshot.items.slice(0, 8).map((item) => item.author))],
      topCommunities: [...new Set(snapshot.items.slice(0, 8).map((item) => item.community).filter((value): value is string => Boolean(value)))],
    });

    return this.paginateSnapshot(snapshot, pageSize, 0);
  }

  public async explain(account = DEFAULT_ACCOUNT, postKey: string) {
    const normalizedAccount = account.trim().toLowerCase() || DEFAULT_ACCOUNT;
    const current = this.explanations.get(normalizedAccount);

    if (current?.has(postKey)) {
      return current.get(postKey);
    }

    await this.buildFeed(normalizedAccount, { refresh: true, pageSize: forYouConfig.pageSizeDefault });
    return this.explanations.get(normalizedAccount)?.get(postKey);
  }

  public async getProfileView(account = DEFAULT_ACCOUNT): Promise<UserProfileView> {
    const normalizedAccount = account.trim().toLowerCase() || DEFAULT_ACCOUNT;
    const profile = await this.getOrSeedProfile(normalizedAccount);

    return {
      profileVersion: profile.profileVersion,
      sourceBlock: profile.sourceBlock,
      topAuthors: profile.topAuthors.filter((entry) => !isExcludedAuthor(entry.key)).slice(0, 6),
      topTags: profile.topTags.filter((entry) => isUsefulTag(entry.key)).slice(0, 6),
      topCommunities: profile.topCommunities.slice(0, 6),
      topLanguages: profile.topLanguages.slice(0, 4),
      contentPrefs: profile.contentPrefs,
      settings: profile.settings,
    };
  }

  public async reset(account = DEFAULT_ACCOUNT) {
    const normalizedAccount = account.trim().toLowerCase() || DEFAULT_ACCOUNT;
    this.overrides.delete(normalizedAccount);
    this.seen.delete(normalizedAccount);
    this.snapshots.delete(normalizedAccount);
    this.explanations.delete(normalizedAccount);
    this.profiles.delete(normalizedAccount);

    return this.getProfileView(normalizedAccount);
  }

  public async getPostDetail(account = DEFAULT_ACCOUNT, postKey: string) {
    const normalizedAccount = account.trim().toLowerCase() || DEFAULT_ACCOUNT;
    const [author, permlink] = postKey.split('/');

    if (!author || !permlink) {
      return undefined;
    }

    const { headBlock } = await this.hive.getHeadState();
    const [raw, comments] = await Promise.all([
      this.hive.getRawPost(author, permlink, normalizedAccount),
      this.hive.getDiscussion(author, permlink).catch(() => [] as CommentItem[]),
    ]);
    const normalized = normalizeBridgePost(raw, headBlock, normalizedAccount);
    return toPostDetail(raw, normalized, comments);
  }

  public async applyAction(account = DEFAULT_ACCOUNT, action: ForYouActionRequest) {
    const normalizedAccount = account.trim().toLowerCase() || DEFAULT_ACCOUNT;
    const { headBlock } = await this.hive.getHeadState();
    const profile = await this.getOrSeedProfile(normalizedAccount);
    const seen = this.getSeen(normalizedAccount);
    const overrides = this.getOverrides(normalizedAccount);
    const detailToNormalizedPost = (detail: PostDetailResponse): NormalizedPost => ({
      postKey: detail.postKey,
      author: detail.author,
      permlink: detail.permlink,
      rootKey: detail.postKey,
      depth: 0,
      community: detail.community,
      tags: detail.tags,
      title: detail.title,
      body: detail.body,
      bodyPreview: detail.bodyPreview,
      image: detail.image,
      app: detail.app,
      language: detail.language,
      createdBlock: headBlock,
      format: {
        imageHeavy: false,
        longform: detail.body.length >= 4_000,
        discussion: false,
        linkPost: /https?:\/\//.test(detail.body),
        video: detail.tags.includes('video') || detail.tags.includes('3speak'),
      },
      stats: detail.stats,
    });

    this.interactions.push({
      account: normalizedAccount,
      event: action.event,
      postKey: 'postKey' in action ? action.postKey : undefined,
      entityKey: 'entityKey' in action ? action.entityKey : undefined,
      snapshotId: 'snapshotId' in action ? action.snapshotId : undefined,
      slot: 'slot' in action ? action.slot : undefined,
      blockNumber: headBlock,
    });

    if ('postKey' in action) {
      seen.add(action.postKey);
    }

    switch (action.event) {
      case 'impression':
        this.profiles.set(normalizedAccount, {
          ...profile,
          counters: {
            ...profile.counters,
            impressions: profile.counters.impressions + 1,
          },
        });
        return { ok: true, profileVersion: profile.profileVersion };
      case 'positive_vote':
      case 'negative_vote':
      case 'open_post':
      case 'engaged_read': {
        const post = await this.getPostDetail(normalizedAccount, action.postKey);
        if (post) {
          const normalizedPost = detailToNormalizedPost(post);
          const signal =
            action.event === 'positive_vote'
              ? 'positive_vote'
              : action.event === 'negative_vote'
                ? 'negative_vote'
                : action.event === 'open_post'
                  ? 'open_post'
                  : 'engaged_read';
          this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, signal, headBlock, normalizedPost));
          this.invalidateSnapshots(normalizedAccount);
        }
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      }
      case 'open_author':
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'open_author', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'open_community':
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'open_community', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'hide_post': {
        overrides.hiddenPosts.add(action.postKey);
        const detail = await this.getPostDetail(normalizedAccount, action.postKey);
        if (detail) {
          const normalizedPost = detailToNormalizedPost(detail);
          this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'hide_post', headBlock, normalizedPost));
        }
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      }
      case 'more_like_author':
        overrides.boostedAuthors.add(action.entityKey);
        overrides.suppressedAuthors.delete(action.entityKey);
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'more_like_author', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'more_like_tag':
        overrides.boostedTags.add(action.entityKey);
        overrides.suppressedTags.delete(action.entityKey);
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'more_like_tag', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'more_like_community':
        overrides.boostedCommunities.add(action.entityKey);
        overrides.suppressedCommunities.delete(action.entityKey);
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'more_like_community', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'less_like_author':
        overrides.suppressedAuthors.add(action.entityKey);
        overrides.boostedAuthors.delete(action.entityKey);
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'less_like_author', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'less_like_tag':
        overrides.suppressedTags.add(action.entityKey);
        overrides.boostedTags.delete(action.entityKey);
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'less_like_tag', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'less_like_community':
        overrides.suppressedCommunities.add(action.entityKey);
        overrides.boostedCommunities.delete(action.entityKey);
        this.updateProfile(normalizedAccount, (current) => applyDirectSignal(current, 'less_like_community', headBlock, undefined, action.entityKey));
        this.invalidateSnapshots(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? profile.profileVersion };
      case 'reset_personalization':
        await this.reset(normalizedAccount);
        return { ok: true, profileVersion: this.profiles.get(normalizedAccount)?.profileVersion ?? 1 };
    }
  }

  public async getInternalFeed(account = DEFAULT_ACCOUNT) {
    const normalizedAccount = account.trim().toLowerCase() || DEFAULT_ACCOUNT;
    await this.buildFeed(normalizedAccount, { refresh: true, pageSize: forYouConfig.pageSizeDefault });
    return {
      snapshot: this.snapshots.get(normalizedAccount),
      explanations: [...(this.explanations.get(normalizedAccount)?.values() ?? [])],
      diagnostics: this.diagnostics.get(normalizedAccount),
    };
  }

  public async getSourceHealth() {
    const { headBlock, irreversibleBlock } = await this.hive.getHeadState();
    return {
      status: 'ok',
      repository: 'live-hive-bridge',
      rpcUrl: HIVE_RPC_URL,
      headBlock,
      irreversibleBlock,
      algorithmVersion,
      account: DEFAULT_ACCOUNT,
      recencyWindowHours: FEED_WINDOW_HOURS,
    };
  }
}
