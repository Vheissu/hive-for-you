export type CandidateSource =
  | 'followed_authors'
  | 'engaged_authors'
  | 'favorite_tags'
  | 'favorite_communities'
  | 'conversation_context'
  | 'reblogs_by_strong_connections'
  | 'similar_users'
  | 'global_exploration'
  | 'global_quality';

export type ReasonCode =
  | 'followed_author'
  | 'engaged_author'
  | 'tag_match'
  | 'community_match'
  | 'thread_match'
  | 'reblogged_by_followed'
  | 'popular_in_interest'
  | 'exploration_pick'
  | 'similar_users'
  | 'recently_active_topic';

export type InteractionEventType =
  | 'impression'
  | 'positive_vote'
  | 'negative_vote'
  | 'open_post'
  | 'engaged_read'
  | 'open_author'
  | 'open_community'
  | 'hide_post'
  | 'more_like_author'
  | 'more_like_tag'
  | 'more_like_community'
  | 'less_like_author'
  | 'less_like_tag'
  | 'less_like_community'
  | 'reset_personalization';

export type EntityScore = {
  key: string;
  score: number;
  positive: number;
  negative: number;
  exposureCount: number;
  lastBlock: number;
};

export type ContentPreferences = {
  imageHeavy: number;
  longform: number;
  discussion: number;
  linkPost: number;
  video: number;
};

export type NormalizedPost = {
  postKey: string;
  author: string;
  permlink: string;
  rootKey: string;
  depth: number;
  community?: string;
  tags: string[];
  title: string;
  body: string;
  bodyPreview: string;
  image?: string;
  app?: string;
  language?: string;
  createdAt?: string;
  createdBlock: number;
  userVoted?: 'up' | 'down';
  format: {
    imageHeavy: boolean;
    longform: boolean;
    discussion: boolean;
    linkPost: boolean;
    video: boolean;
  };
  stats: {
    positiveVotes: number;
    negativeVotes: number;
    children: number;
    netRshares?: string;
    pendingPayout?: number;
    authorReputation?: number;
    hide: boolean;
    gray: boolean;
    promoted?: number;
  };
};

export type FeedItem = {
  postKey: string;
  author: string;
  permlink: string;
  title: string;
  bodyPreview: string;
  community?: string;
  tags: string[];
  image?: string;
  app?: string;
  language?: string;
  createdAt?: string;
  userVoted?: 'up' | 'down';
  stats: {
    positiveVotes: number;
    negativeVotes: number;
    children: number;
    authorReputation?: number;
    pendingPayout?: number;
    hide: boolean;
    gray: boolean;
    promoted?: number;
  };
  context: {
    reasonCodes: ReasonCode[];
    sourceSet: CandidateSource[];
    rebloggedBy?: string[];
  };
};

export type UserProfile = {
  account: string;
  profileVersion: number;
  sourceBlock: number;
  topAuthors: EntityScore[];
  topTags: EntityScore[];
  topCommunities: EntityScore[];
  topThreads: EntityScore[];
  topApps: EntityScore[];
  topLanguages: EntityScore[];
  contentPrefs: ContentPreferences;
  settings: {
    includeNsfw: boolean;
    includeReblogs: boolean;
    exploreRatio: number;
  };
  counters: {
    impressions: number;
    opens: number;
    engagedReads: number;
    hides: number;
  };
};

export type UserProfileView = Pick<
  UserProfile,
  | 'profileVersion'
  | 'sourceBlock'
  | 'topAuthors'
  | 'topTags'
  | 'topCommunities'
  | 'topLanguages'
  | 'contentPrefs'
  | 'settings'
>;

export type ForYouResponse = {
  snapshotId: string;
  profileVersion: number;
  headBlock: number;
  nextCursor?: string;
  items: FeedItem[];
};

export type ExplainResponse = {
  postKey: string;
  reasons: Array<{
    code: ReasonCode;
    text: string;
    contribution: number;
  }>;
  sourceSet: CandidateSource[];
};

export type CommentItem = {
  author: string;
  body: string;
  createdAt: string;
  depth: number;
  votes: number;
  children: number;
};

export type PostDetailResponse = {
  postKey: string;
  author: string;
  permlink: string;
  title: string;
  body: string;
  rawBody: string;
  bodyPreview: string;
  community?: string;
  tags: string[];
  image?: string;
  app?: string;
  language?: string;
  createdAt?: string;
  url?: string;
  userVoted?: 'up' | 'down';
  stats: FeedItem['stats'];
  comments: CommentItem[];
};

export type ForYouActionRequest =
  | { event: 'impression'; postKey: string; snapshotId: string; slot: number }
  | { event: 'positive_vote'; postKey: string; snapshotId: string; slot: number }
  | { event: 'negative_vote'; postKey: string; snapshotId: string; slot: number }
  | { event: 'open_post'; postKey: string; snapshotId: string; slot: number }
  | { event: 'engaged_read'; postKey: string; snapshotId: string; slot: number }
  | { event: 'open_author'; entityKey: string }
  | { event: 'open_community'; entityKey: string }
  | { event: 'hide_post'; postKey: string }
  | { event: 'more_like_author'; entityKey: string }
  | { event: 'more_like_tag'; entityKey: string }
  | { event: 'more_like_community'; entityKey: string }
  | { event: 'less_like_author'; entityKey: string }
  | { event: 'less_like_tag'; entityKey: string }
  | { event: 'less_like_community'; entityKey: string }
  | { event: 'reset_personalization' };

export type PreferenceOverrides = {
  hiddenPosts: Set<string>;
  suppressedAuthors: Set<string>;
  suppressedTags: Set<string>;
  suppressedCommunities: Set<string>;
  boostedAuthors: Set<string>;
  boostedTags: Set<string>;
  boostedCommunities: Set<string>;
};

export type FeedSnapshot = {
  id: string;
  account: string;
  profileVersion: number;
  headBlock: number;
  createdBlock: number;
  items: RankedFeedItem[];
};

export type RankedFeedItem = FeedItem & {
  score: number;
  contributions: Partial<Record<ReasonCode, number>>;
};

export type InteractionEvent = {
  account: string;
  event: InteractionEventType;
  postKey?: string;
  entityKey?: string;
  snapshotId?: string;
  slot?: number;
  blockNumber: number;
};

export type SimilarUser = {
  account: string;
  score: number;
};

export type ChainEventSeed = {
  account: string;
  type:
    | 'follow'
    | 'subscribe_community'
    | 'positive_vote'
    | 'negative_vote'
    | 'open_post'
    | 'engaged_read'
    | 'comment'
    | 'reblog';
  postKey?: string;
  entityKey?: string;
  blockNumber: number;
};

export type CandidateFeatures = {
  sourcePrior: number;
  authorAffinity: number;
  tagAffinity: number;
  communityAffinity: number;
  threadAffinity: number;
  appAffinity: number;
  languageAffinity: number;
  formatAffinity: number;
  relationshipBoost: number;
  qualityScore: number;
  freshnessScore: number;
  noveltyScore: number;
  explorationBonus: number;
  overrideBoost: number;
  overridePenalty: number;
  safetyPenalty: number;
  contributions: Partial<Record<ReasonCode, number>>;
};

export interface ChainRepository {
  getHeadBlock(): Promise<number>;
  getIrreversibleBlock(): Promise<number>;
  getFollowedAuthors(account: string): Promise<string[]>;
  getSubscribedCommunities(account: string): Promise<string[]>;
  getRecentPostsByAuthors(authors: string[], limit: number): Promise<NormalizedPost[]>;
  getRecentPostsByCommunities(communities: string[], limit: number): Promise<NormalizedPost[]>;
  getRecentPostsByTags(tags: string[], limit: number): Promise<NormalizedPost[]>;
  getRecentPostsByRootKeys(rootKeys: string[], limit: number): Promise<NormalizedPost[]>;
  getRecentReblogsByAuthors(authors: string[], limit: number): Promise<Array<{ postKey: string; by: string }>>;
  getGlobalTrending(limit: number): Promise<NormalizedPost[]>;
  getGlobalHot(limit: number): Promise<NormalizedPost[]>;
  getGlobalCreated(limit: number): Promise<NormalizedPost[]>;
  getPost(postKey: string): Promise<NormalizedPost | undefined>;
  getAllTopLevelPosts(): Promise<NormalizedPost[]>;
}
