export const algorithmVersion = 'deterministic-v1';

export const rankWeights = {
  sourcePrior: 0.7,
  authorAffinity: 1.3,
  tagAffinity: 1.1,
  communityAffinity: 1.0,
  threadAffinity: 0.8,
  appAffinity: 0.35,
  languageAffinity: 0.2,
  formatAffinity: 0.3,
  relationshipBoost: 1.0,
  qualityScore: 1.2,
  freshnessScore: 0.85,
  noveltyScore: 0.4,
  explorationBonus: 0.35,
  overrideBoost: 1.4,
  overridePenalty: 1.8,
  safetyPenalty: 2.5,
} as const;

export const decayBlocks = {
  follow: 0,
  subscribeCommunity: 0,
  comment: 260_000,
  reblog: 220_000,
  positiveVote: 180_000,
  openPost: 120_000,
  engagedRead: 160_000,
  hide: 320_000,
  explicitSuppression: 0,
  explicitBoost: 0,
} as const;

export const signalWeights = {
  follow: 8,
  subscribeCommunity: 7,
  comment: 6,
  reblog: 5.5,
  positiveVote: 5,
  openPost: 2,
  engagedRead: 3,
  openCommunity: 1.5,
  openAuthor: 1.5,
  negativeVote: -6,
  hide: -8,
  lessAuthor: -10,
  lessTag: -8,
  lessCommunity: -8,
  moreAuthor: 6,
  moreTag: 5,
  moreCommunity: 5,
} as const;

export const signalAllocation = {
  author: 1,
  community: 0.9,
  tagsShared: 0.8,
  thread: 0.5,
  app: 0.2,
  language: 0.2,
  format: 0.2,
} as const;

export const diversityRules = {
  authorWindow: 4,
  communityWindow: 3,
  threadWindow: 1,
  explorationEvery: 6,
} as const;

export const forYouConfig = {
  pageSizeDefault: 12,
  pageSizeMax: 24,
  snapshotReuseBlockDrift: 35,
  candidateBudgets: {
    followedAuthors: 72,
    engagedAuthors: 48,
    favoriteTags: 72,
    favoriteCommunities: 72,
    conversationContext: 30,
    reblogsByStrongConnections: 30,
    similarUsers: 48,
    globalExploration: 48,
  },
  rankWeights,
  decayBlocks,
  diversityRules,
  signalWeights,
  signalAllocation,
  minimumQualityScore: 0.22,
  maxSourceScore: 10,
  nsfwDefault: false,
  grayContentMode: 'exclude' as const,
};

export const excludedAuthorAccounts = new Set(['hivebuzz', 'leothreads']);
export const excludedApps = new Set(['hivebuzz', 'leothreads']);
export const lowSignalTags = new Set([
  'blog',
  'blockchain',
  'community',
  'creativecoin',
  'crypto',
  'ecency',
  'hive',
  'hiveblockchain',
  'inleo',
  'leofinance',
  'leothreads',
  'microblogging',
  'hivesnaps',
  'neoxian',
  'ocd',
  'ocdb',
  'palnet',
  'peakd',
  'pimp',
  'posh',
  'proofofbrain',
  'reply',
  'waivio',
]);

export const sourcePriorWeights = {
  followed_authors: 1,
  engaged_authors: 0.9,
  favorite_tags: 0.82,
  favorite_communities: 0.84,
  conversation_context: 0.72,
  reblogs_by_strong_connections: 0.75,
  similar_users: 0.68,
  global_exploration: 0.42,
  global_quality: 0.68,
} as const;

export const reasonText: Record<string, string> = {
  followed_author: 'You follow this author',
  engaged_author: 'You often interact with this author',
  tag_match: 'Matches tags you engage with',
  community_match: 'From a community you follow or engage with',
  thread_match: 'Related to a discussion you joined',
  reblogged_by_followed: 'Reblogged by an account close to your network',
  popular_in_interest: 'Popular within topics you like',
  exploration_pick: 'Suggested to widen your feed',
  similar_users: 'Accounts with similar interests engaged with this',
  recently_active_topic: 'Similar to topics you have been engaging with',
};
