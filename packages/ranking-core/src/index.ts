import {
  excludedApps,
  excludedAuthorAccounts,
  forYouConfig,
  lowSignalTags,
  rankWeights,
  reasonText,
  signalAllocation,
  signalWeights,
  sourcePriorWeights,
} from '../../shared-config/src/index';
import type {
  CandidateFeatures,
  CandidateSource,
  EntityScore,
  ExplainResponse,
  FeedItem,
  NormalizedPost,
  PreferenceOverrides,
  RankedFeedItem,
  ReasonCode,
  UserProfile,
} from '../../shared-types/src/index';

type CandidateEnvelope = {
  post: NormalizedPost;
  sourceSet: Set<CandidateSource>;
  rebloggedBy: string[];
};

type ScoredEnvelope = CandidateEnvelope & {
  features: CandidateFeatures;
  score: number;
};

type DirectSignalType =
  | 'follow'
  | 'subscribe_community'
  | 'positive_vote'
  | 'negative_vote'
  | 'open_post'
  | 'engaged_read'
  | 'comment'
  | 'reblog'
  | 'hide_post'
  | 'more_like_author'
  | 'more_like_tag'
  | 'more_like_community'
  | 'less_like_author'
  | 'less_like_tag'
  | 'less_like_community'
  | 'open_author'
  | 'open_community';

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function decayScore(score: number, blocksSinceLastUpdate: number, decayBlocks: number) {
  if (decayBlocks <= 0) {
    return score;
  }

  return score * Math.exp(-blocksSinceLastUpdate / decayBlocks);
}

export function applyFeatureUpdate(current: EntityScore, delta: number, currentBlock: number, decayBlocks: number): EntityScore {
  const decayedScore = decayScore(current.score, currentBlock - current.lastBlock, decayBlocks);
  const normalizedDelta = delta / Math.sqrt(1 + current.exposureCount);

  return {
    ...current,
    score: clamp(decayedScore + normalizedDelta, -20, 20),
    exposureCount: current.exposureCount + 1,
    lastBlock: currentBlock,
    positive: delta > 0 ? current.positive + 1 : current.positive,
    negative: delta < 0 ? current.negative + 1 : current.negative,
  };
}

export function createEmptyProfile(account: string, currentBlock: number): UserProfile {
  return {
    account,
    profileVersion: 1,
    sourceBlock: currentBlock,
    topAuthors: [],
    topTags: [],
    topCommunities: [],
    topThreads: [],
    topApps: [],
    topLanguages: [],
    contentPrefs: {
      imageHeavy: 0,
      longform: 0,
      discussion: 0,
      linkPost: 0,
      video: 0,
    },
    settings: {
      includeNsfw: forYouConfig.nsfwDefault,
      includeReblogs: true,
      exploreRatio: 0.28,
    },
    counters: {
      impressions: 0,
      opens: 0,
      engagedReads: 0,
      hides: 0,
    },
  };
}

export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function updateScoreList(list: EntityScore[], key: string, delta: number, currentBlock: number, decayBlocks: number) {
  const existing = list.find((entry) => entry.key === key) ?? {
    key,
    score: 0,
    positive: 0,
    negative: 0,
    exposureCount: 0,
    lastBlock: currentBlock,
  };

  const next = applyFeatureUpdate(existing, delta, currentBlock, decayBlocks);
  const filtered = list.filter((entry) => entry.key !== key);
  filtered.push(next);

  return filtered.sort((left, right) => right.score - left.score).slice(0, 16);
}

export function isExcludedAuthor(author?: string) {
  return author ? excludedAuthorAccounts.has(author.trim().toLowerCase()) : false;
}

function isExcludedApp(app?: string) {
  return app ? excludedApps.has(app.trim().toLowerCase()) : false;
}

function normalizeEntityScore(list: EntityScore[], key?: string) {
  if (!key) {
    return 0;
  }

  const match = list.find((entry) => entry.key === key);

  if (!match) {
    return 0;
  }

  return clamp(match.score / 10, -1, 1);
}

function averageTagAffinity(list: EntityScore[], tags: string[]) {
  const usefulTags = tags.filter((tag) => isUsefulTag(tag));

  if (usefulTags.length === 0) {
    return 0;
  }

  const values = usefulTags
    .map((tag) => normalizeEntityScore(list, tag))
    .filter((value) => value !== 0);

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isUsefulTag(tag?: string) {
  if (!tag) {
    return false;
  }

  const normalized = tag.trim().toLowerCase();

  return normalized.length > 1 && !lowSignalTags.has(normalized) && !normalized.startsWith('hive-');
}

function formatAffinity(post: NormalizedPost, profile: UserProfile) {
  let score = 0;

  if (post.format.imageHeavy) {
    score += profile.contentPrefs.imageHeavy;
  }

  if (post.format.longform) {
    score += profile.contentPrefs.longform;
  }

  if (post.format.discussion) {
    score += profile.contentPrefs.discussion;
  }

  if (post.format.linkPost) {
    score += profile.contentPrefs.linkPost;
  }

  if (post.format.video) {
    score += profile.contentPrefs.video;
  }

  return clamp(score / 6, -1, 1);
}

function tagWeight(tagCount: number) {
  return signalAllocation.tagsShared / Math.sqrt(tagCount || 1);
}

function withCounter(profile: UserProfile, field: keyof UserProfile['counters']) {
  return {
    ...profile,
    counters: {
      ...profile.counters,
      [field]: profile.counters[field] + 1,
    },
  };
}

export function applyDirectSignal(profile: UserProfile, signal: DirectSignalType, currentBlock: number, post?: NormalizedPost, entityKey?: string) {
  let next = { ...profile };

  if (post && (isExcludedAuthor(post.author) || isExcludedApp(post.app))) {
    next.sourceBlock = currentBlock;
    return next;
  }

  if (
    entityKey &&
    (signal === 'follow' ||
      signal === 'more_like_author' ||
      signal === 'less_like_author' ||
      signal === 'open_author') &&
    isExcludedAuthor(entityKey)
  ) {
    next.sourceBlock = currentBlock;
    return next;
  }

  const updateAuthor = (key: string, delta: number, decayBlocks: number) => {
    next = { ...next, topAuthors: updateScoreList(next.topAuthors, key, delta, currentBlock, decayBlocks) };
  };

  const updateCommunity = (key: string, delta: number, decayBlocks: number) => {
    next = { ...next, topCommunities: updateScoreList(next.topCommunities, key, delta, currentBlock, decayBlocks) };
  };

  const updateTag = (key: string, delta: number, decayBlocks: number) => {
    next = { ...next, topTags: updateScoreList(next.topTags, key, delta, currentBlock, decayBlocks) };
  };

  const updateThread = (key: string, delta: number, decayBlocks: number) => {
    next = { ...next, topThreads: updateScoreList(next.topThreads, key, delta, currentBlock, decayBlocks) };
  };

  const updateApp = (key: string, delta: number, decayBlocks: number) => {
    next = { ...next, topApps: updateScoreList(next.topApps, key, delta, currentBlock, decayBlocks) };
  };

  const updateLanguage = (key: string, delta: number, decayBlocks: number) => {
    next = { ...next, topLanguages: updateScoreList(next.topLanguages, key, delta, currentBlock, decayBlocks) };
  };

  const updateFormats = (delta: number) => {
    if (!post) {
      return;
    }

    next = {
      ...next,
      contentPrefs: {
        imageHeavy: clamp(next.contentPrefs.imageHeavy + (post.format.imageHeavy ? delta * 0.2 : 0), -6, 6),
        longform: clamp(next.contentPrefs.longform + (post.format.longform ? delta * 0.2 : 0), -6, 6),
        discussion: clamp(next.contentPrefs.discussion + (post.format.discussion ? delta * 0.2 : 0), -6, 6),
        linkPost: clamp(next.contentPrefs.linkPost + (post.format.linkPost ? delta * 0.2 : 0), -6, 6),
        video: clamp(next.contentPrefs.video + (post.format.video ? delta * 0.2 : 0), -6, 6),
      },
    };
  };

  const applyPostDelta = (delta: number, decayKey: keyof typeof forYouConfig.decayBlocks) => {
    if (!post) {
      return;
    }

    updateAuthor(post.author, delta * signalAllocation.author, forYouConfig.decayBlocks[decayKey]);

    if (post.community) {
      updateCommunity(post.community, delta * signalAllocation.community, forYouConfig.decayBlocks[decayKey]);
    }

    for (const tag of post.tags) {
      updateTag(tag, delta * tagWeight(post.tags.length), forYouConfig.decayBlocks[decayKey]);
    }

    updateThread(post.rootKey, delta * signalAllocation.thread, forYouConfig.decayBlocks[decayKey]);

    if (post.app) {
      updateApp(post.app, delta * signalAllocation.app, forYouConfig.decayBlocks[decayKey]);
    }

    if (post.language) {
      updateLanguage(post.language, delta * signalAllocation.language, forYouConfig.decayBlocks[decayKey]);
    }

    updateFormats(delta * signalAllocation.format);
  };

  switch (signal) {
    case 'follow':
      if (entityKey) {
        updateAuthor(entityKey, signalWeights.follow, forYouConfig.decayBlocks.follow);
      }
      break;
    case 'subscribe_community':
      if (entityKey) {
        updateCommunity(entityKey, signalWeights.subscribeCommunity, forYouConfig.decayBlocks.subscribeCommunity);
      }
      break;
    case 'positive_vote':
      applyPostDelta(signalWeights.positiveVote, 'positiveVote');
      break;
    case 'negative_vote':
      applyPostDelta(signalWeights.negativeVote, 'hide');
      break;
    case 'open_post':
      next = withCounter(next, 'opens');
      applyPostDelta(signalWeights.openPost, 'openPost');
      break;
    case 'engaged_read':
      next = withCounter(next, 'engagedReads');
      applyPostDelta(signalWeights.engagedRead, 'engagedRead');
      break;
    case 'comment':
      applyPostDelta(signalWeights.comment, 'comment');
      break;
    case 'reblog':
      applyPostDelta(signalWeights.reblog, 'reblog');
      break;
    case 'hide_post':
      next = withCounter(next, 'hides');
      applyPostDelta(signalWeights.hide, 'hide');
      break;
    case 'more_like_author':
      if (entityKey) {
        updateAuthor(entityKey, signalWeights.moreAuthor, forYouConfig.decayBlocks.explicitBoost);
      }
      break;
    case 'more_like_tag':
      if (entityKey) {
        updateTag(entityKey, signalWeights.moreTag, forYouConfig.decayBlocks.explicitBoost);
      }
      break;
    case 'more_like_community':
      if (entityKey) {
        updateCommunity(entityKey, signalWeights.moreCommunity, forYouConfig.decayBlocks.explicitBoost);
      }
      break;
    case 'less_like_author':
      if (entityKey) {
        updateAuthor(entityKey, signalWeights.lessAuthor, forYouConfig.decayBlocks.explicitSuppression);
      }
      break;
    case 'less_like_tag':
      if (entityKey) {
        updateTag(entityKey, signalWeights.lessTag, forYouConfig.decayBlocks.explicitSuppression);
      }
      break;
    case 'less_like_community':
      if (entityKey) {
        updateCommunity(entityKey, signalWeights.lessCommunity, forYouConfig.decayBlocks.explicitSuppression);
      }
      break;
    case 'open_author':
      if (entityKey) {
        updateAuthor(entityKey, signalWeights.openAuthor, forYouConfig.decayBlocks.openPost);
      }
      break;
    case 'open_community':
      if (entityKey) {
        updateCommunity(entityKey, signalWeights.openCommunity, forYouConfig.decayBlocks.openPost);
      }
      break;
  }

  next.sourceBlock = currentBlock;

  return next;
}

export function mergeCandidates(
  sourceBatches: Partial<Record<CandidateSource, NormalizedPost[]>>,
  reblogsByPost: Map<string, string[]>,
) {
  const merged = new Map<string, CandidateEnvelope>();

  for (const [source, posts] of Object.entries(sourceBatches) as Array<[CandidateSource, NormalizedPost[] | undefined]>) {
    for (const post of posts ?? []) {
      const existing = merged.get(post.postKey) ?? {
        post,
        sourceSet: new Set<CandidateSource>(),
        rebloggedBy: [],
      };

      existing.sourceSet.add(source);
      existing.rebloggedBy = [...new Set([...(existing.rebloggedBy ?? []), ...(reblogsByPost.get(post.postKey) ?? [])])];
      merged.set(post.postKey, existing);
    }
  }

  return [...merged.values()];
}

function normalizedLogScore(value: number, ceiling: number) {
  if (ceiling <= 1) {
    return 0;
  }

  return clamp(Math.log1p(Math.max(value, 0)) / Math.log1p(ceiling), 0, 1);
}

function normalizedApp(post: NormalizedPost) {
  return post.app?.trim().toLowerCase();
}

function hasActifitReportPattern(post: NormalizedPost) {
  const title = post.title.toLowerCase();
  const body = post.body.toLowerCase();
  const app = normalizedApp(post);

  return (
    app === 'actifit' ||
    title.includes('actifit report card') ||
    body.includes('published via actifit app') ||
    body.includes('actifit.io')
  );
}

function hasThreadContainerPattern(post: NormalizedPost) {
  const title = post.title.toLowerCase();
  const app = normalizedApp(post);
  const tags = new Set(post.tags.map((t) => t.toLowerCase()));

  return (
    tags.has('leothreads') ||
    tags.has('hivesnaps') ||
    /^leothread\b/.test(title) ||
    /^(peaksnaps|hivesnaps)\b/.test(title) ||
    title.includes('multi container thread') ||
    app === 'liketu' && title === '' ||
    /^(snaps|threads)\s+\d{4}/.test(title)
  );
}

function hasRoundupPattern(post: NormalizedPost) {
  const title = post.title.toLowerCase();
  const body = post.body.toLowerCase();

  return (
    /\b(best of|roundup|digest|curation|curator|highlights|featured posts|top posts|daily mix|weekly mix|recap|winners?)\b/.test(
      title,
    ) || /\b(curated by|community highlights|weekly roundup|daily digest|featured posts|selected posts|top picks|winning entries)\b/.test(body)
  );
}

function hasMarketPromoPattern(post: NormalizedPost) {
  const title = post.title.toLowerCase();
  const body = post.body.toLowerCase();

  return (
    /\b(pumps?|explodes?|skyrockets?|moon(?:ing)?|surges?)\b/.test(title) &&
    /\b(binance|current price|24h change)\b/.test(body)
  );
}

function hasAnnouncementPattern(post: NormalizedPost) {
  const title = post.title.toLowerCase();
  const body = post.body.toLowerCase();

  return (
    /\b(get ready|hours until|starting soon|starts in|community hour|free entry|prize pool)\b/.test(title) ||
    /\b(join us live|set a reminder|free entry|prize pool|starting soon)\b/.test(body)
  );
}

function hasCurationAuthorPattern(author: string) {
  return /\b(curation|digest|roundup|highlights|featured|daily[-_]?mix)\b/.test(author.toLowerCase());
}

function computePatternPenalty(post: NormalizedPost) {
  let penalty = 0;

  if (hasActifitReportPattern(post)) {
    penalty += 1.1;
  }

  if (hasRoundupPattern(post)) {
    penalty += 0.52;
  }

  if (hasMarketPromoPattern(post) && post.stats.children < 4) {
    penalty += 0.38;
  }

  if (hasAnnouncementPattern(post)) {
    penalty += 0.55;
  }

  if (/\b(medals?|badge|leaderboard|rank)\b/.test(post.title.toLowerCase())) {
    penalty += 0.4;
  }

  if (post.tags.length >= 12) {
    penalty += 0.12;
  }

  if ((post.body.match(/<[^>]+>/g)?.length ?? 0) >= 6) {
    penalty += 0.12;
  }

  if ((post.stats.pendingPayout ?? 0) < 0.05 && post.stats.positiveVotes < 8 && post.stats.children === 0) {
    penalty += 0.14;
  }

  return penalty;
}

function computeQualityScore(post: NormalizedPost) {
  const positive = normalizedLogScore(post.stats.positiveVotes, 180) * 0.42;
  const discussion = normalizedLogScore(post.stats.children, 24) * 0.18;
  const payout = normalizedLogScore(post.stats.pendingPayout ?? 0, 18) * 0.12;
  const reputation = clamp(((post.stats.authorReputation ?? 50) - 50) / 25, 0, 1) * 0.08;
  const bodyDepth = clamp(post.body.length / 3_500, 0, 1) * 0.12;
  const titleDepth = clamp(post.title.trim().length / 80, 0, 1) * 0.08;
  const negativePenalty = Math.log1p(post.stats.negativeVotes) * 0.25;
  const promotedPenalty = Math.log1p(post.stats.promoted ?? 0) * 0.08;
  const patternPenalty = computePatternPenalty(post);

  return clamp(
    positive + discussion + payout + reputation + bodyDepth + titleDepth - negativePenalty - promotedPenalty - patternPenalty,
    0,
    1.4,
  );
}

function computeFreshnessScore(post: NormalizedPost, headBlock: number) {
  const blocksAgo = Math.max(headBlock - post.createdBlock, 0);
  return clamp(Math.exp(-blocksAgo / 12_500), 0.08, 1);
}

function computeNoveltyScore(postKey: string, seenPostKeys: Set<string>) {
  return seenPostKeys.has(postKey) ? 0.15 : 1;
}

function computeSourcePrior(sourceSet: Set<CandidateSource>) {
  const values = [...sourceSet].map((source) => sourcePriorWeights[source]);
  return clamp(Math.max(...values, 0.1), 0, forYouConfig.maxSourceScore);
}

function buildReasonContributions(
  post: NormalizedPost,
  sourceSet: Set<CandidateSource>,
  features: Omit<CandidateFeatures, 'contributions'>,
  rebloggedBy: string[],
) {
  const contributions: Partial<Record<ReasonCode, number>> = {};

  if (sourceSet.has('followed_authors')) {
    contributions.followed_author = features.relationshipBoost * 0.9 + features.authorAffinity * 0.6;
  }

  if (features.authorAffinity > 0.2 && !contributions.followed_author) {
    contributions.engaged_author = features.authorAffinity * rankWeights.authorAffinity;
  }

  if (features.tagAffinity > 0.18) {
    contributions.tag_match = features.tagAffinity * rankWeights.tagAffinity;
  }

  if (features.communityAffinity > 0.18) {
    contributions.community_match = features.communityAffinity * rankWeights.communityAffinity;
  }

  if (features.threadAffinity > 0.15) {
    contributions.thread_match = features.threadAffinity * rankWeights.threadAffinity;
  }

  if (rebloggedBy.length > 0 && sourceSet.has('reblogs_by_strong_connections')) {
    contributions.reblogged_by_followed = 0.82;
  }

  if (features.qualityScore > 0.5 && (features.tagAffinity > 0.15 || features.communityAffinity > 0.15)) {
    contributions.popular_in_interest = features.qualityScore * 0.9;
  }

  if (sourceSet.has('global_exploration') || sourceSet.has('global_quality')) {
    contributions.exploration_pick = features.explorationBonus + features.freshnessScore * 0.15;
  }

  if (sourceSet.has('similar_users')) {
    contributions.similar_users = 0.64 + features.tagAffinity * 0.1;
  }

  if (features.freshnessScore > 0.5 && (features.tagAffinity > 0.18 || features.communityAffinity > 0.18)) {
    contributions.recently_active_topic = features.freshnessScore * 0.55;
  }

  if (post.community && sourceSet.has('favorite_communities')) {
    contributions.community_match = Math.max(contributions.community_match ?? 0, features.communityAffinity * 1.02);
  }

  return contributions;
}

function computeOverrideBoost(post: NormalizedPost, overrides: PreferenceOverrides) {
  let score = 0;

  if (overrides.boostedAuthors.has(post.author)) {
    score += 0.75;
  }

  if (post.community && overrides.boostedCommunities.has(post.community)) {
    score += 0.55;
  }

  if (post.tags.some((tag) => overrides.boostedTags.has(tag))) {
    score += 0.45;
  }

  return score;
}

function computeOverridePenalty(post: NormalizedPost, overrides: PreferenceOverrides) {
  let score = 0;

  if (overrides.suppressedAuthors.has(post.author)) {
    score += 1;
  }

  if (post.community && overrides.suppressedCommunities.has(post.community)) {
    score += 0.9;
  }

  if (post.tags.some((tag) => overrides.suppressedTags.has(tag))) {
    score += 0.85;
  }

  return score;
}

function computeSafetyPenalty(post: NormalizedPost, authorFrequency: number) {
  let score = 0;

  if (post.stats.negativeVotes > post.stats.positiveVotes * 0.4) {
    score += 0.35;
  }

  if (post.stats.gray) {
    score += 0.45;
  }

  if (computeQualityScore(post) < forYouConfig.minimumQualityScore) {
    score += 0.22;
  }

  if (authorFrequency > 2) {
    score += (authorFrequency - 2) * 0.25;
  }

  if (hasRoundupPattern(post) && authorFrequency > 1) {
    score += (authorFrequency - 1) * 0.45;
  }

  if (hasCurationAuthorPattern(post.author)) {
    score += 0.18;

    if (authorFrequency > 1) {
      score += (authorFrequency - 1) * 0.2;
    }
  }

  score += computePatternPenalty(post);

  return score;
}

export function scoreCandidate(features: CandidateFeatures) {
  return (
    features.sourcePrior * rankWeights.sourcePrior +
    features.authorAffinity * rankWeights.authorAffinity +
    features.tagAffinity * rankWeights.tagAffinity +
    features.communityAffinity * rankWeights.communityAffinity +
    features.threadAffinity * rankWeights.threadAffinity +
    features.appAffinity * rankWeights.appAffinity +
    features.languageAffinity * rankWeights.languageAffinity +
    features.formatAffinity * rankWeights.formatAffinity +
    features.relationshipBoost * rankWeights.relationshipBoost +
    features.qualityScore * rankWeights.qualityScore +
    features.freshnessScore * rankWeights.freshnessScore +
    features.noveltyScore * rankWeights.noveltyScore +
    features.explorationBonus * rankWeights.explorationBonus +
    features.overrideBoost * rankWeights.overrideBoost -
    features.overridePenalty * rankWeights.overridePenalty -
    features.safetyPenalty * rankWeights.safetyPenalty
  );
}

export function isHardFiltered(post: NormalizedPost, overrides: PreferenceOverrides, seenPostKeys: Set<string>, includeNsfw: boolean) {
  if (post.depth !== 0 || post.stats.hide) {
    return true;
  }

  if (post.userVoted) {
    return true;
  }

  if (isExcludedAuthor(post.author) || isExcludedApp(post.app)) {
    return true;
  }

  if (hasActifitReportPattern(post)) {
    return true;
  }

  if (hasThreadContainerPattern(post)) {
    return true;
  }

  if (post.stats.gray && forYouConfig.grayContentMode === 'exclude') {
    return true;
  }

  if (overrides.hiddenPosts.has(post.postKey)) {
    return true;
  }

  if (overrides.suppressedAuthors.has(post.author)) {
    return true;
  }

  if (post.community && overrides.suppressedCommunities.has(post.community)) {
    return true;
  }

  if (post.tags.some((tag) => overrides.suppressedTags.has(tag))) {
    return true;
  }

  if (!includeNsfw && post.tags.includes('nsfw')) {
    return true;
  }

  return seenPostKeys.has(post.postKey) && overrides.hiddenPosts.has(post.postKey);
}

export function buildCandidateFeatures(
  envelope: CandidateEnvelope,
  profile: UserProfile,
  overrides: PreferenceOverrides,
  seenPostKeys: Set<string>,
  headBlock: number,
  authorFrequency: number,
): CandidateFeatures {
  const { post, sourceSet, rebloggedBy } = envelope;

  const baseFeatures = {
    sourcePrior: computeSourcePrior(sourceSet),
    authorAffinity: normalizeEntityScore(profile.topAuthors, post.author),
    tagAffinity: averageTagAffinity(profile.topTags, post.tags),
    communityAffinity: normalizeEntityScore(profile.topCommunities, post.community),
    threadAffinity: normalizeEntityScore(profile.topThreads, post.rootKey),
    appAffinity: normalizeEntityScore(profile.topApps, post.app),
    languageAffinity: normalizeEntityScore(profile.topLanguages, post.language),
    formatAffinity: formatAffinity(post, profile),
    relationshipBoost: sourceSet.has('followed_authors') || sourceSet.has('favorite_communities') ? 0.92 : 0.18,
    qualityScore: computeQualityScore(post),
    freshnessScore: computeFreshnessScore(post, headBlock),
    noveltyScore: computeNoveltyScore(post.postKey, seenPostKeys),
    explorationBonus: sourceSet.has('global_exploration') ? profile.settings.exploreRatio : 0,
    overrideBoost: computeOverrideBoost(post, overrides),
    overridePenalty: computeOverridePenalty(post, overrides),
    safetyPenalty: computeSafetyPenalty(post, authorFrequency),
  };

  return {
    ...baseFeatures,
    contributions: buildReasonContributions(post, sourceSet, baseFeatures, rebloggedBy),
  };
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
}

export function similarity(left: NormalizedPost, right: NormalizedPost) {
  let value = 0;

  if (left.postKey === right.postKey) {
    value += 10;
  }

  if (left.rootKey === right.rootKey) {
    value += 4;
  }

  if (left.author === right.author) {
    value += 2.5;
  }

  if (left.community && left.community === right.community) {
    value += 1.2;
  }

  value += jaccard(left.tags, right.tags);

  return value;
}

export function rerankWithDiversity(scored: ScoredEnvelope[]) {
  const selected: ScoredEnvelope[] = [];
  const remaining = [...scored];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const redundancyPenalty = selected.reduce(
        (maximum, chosen) => Math.max(maximum, similarity(candidate.post, chosen.post)),
        0,
      );
      const sourceBonus = candidate.sourceSet.has('global_exploration') ? 0.15 : 0;
      const rerankValue = candidate.score - redundancyPenalty * 0.35 + sourceBonus;

      if (rerankValue > bestValue) {
        bestValue = rerankValue;
        bestIndex = index;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

export function deriveReasons(contributions: Partial<Record<ReasonCode, number>>) {
  return Object.entries(contributions)
    .filter((entry): entry is [ReasonCode, number] => Boolean(entry[1] && entry[1] > 0))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([reason]) => reason);
}

export function toExplainResponse(postKey: string, contributions: Partial<Record<ReasonCode, number>>, sourceSet: Set<CandidateSource>): ExplainResponse {
  const reasons = deriveReasons(contributions).map((code) => ({
    code,
    text: reasonText[code],
    contribution: Number((contributions[code] ?? 0).toFixed(2)),
  }));

  return {
    postKey,
    reasons,
    sourceSet: [...sourceSet],
  };
}

export function toRankedFeedItem(scored: ScoredEnvelope): RankedFeedItem {
  const reasonCodes = deriveReasons(scored.features.contributions);

  return {
    postKey: scored.post.postKey,
    author: scored.post.author,
    permlink: scored.post.permlink,
    title: scored.post.title,
    bodyPreview: scored.post.bodyPreview,
    community: scored.post.community,
    tags: scored.post.tags,
    image: scored.post.image,
    app: scored.post.app,
    language: scored.post.language,
    createdAt: scored.post.createdAt,
    userVoted: scored.post.userVoted,
    stats: scored.post.stats,
    context: {
      reasonCodes,
      sourceSet: [...scored.sourceSet],
      rebloggedBy: scored.rebloggedBy.length > 0 ? scored.rebloggedBy : undefined,
    },
    score: Number(scored.score.toFixed(3)),
    contributions: scored.features.contributions,
  };
}

export function toFeedItem(item: RankedFeedItem): FeedItem {
  return {
    postKey: item.postKey,
    author: item.author,
    permlink: item.permlink,
    title: item.title,
    bodyPreview: item.bodyPreview,
    community: item.community,
    tags: item.tags,
    image: item.image,
    app: item.app,
    language: item.language,
    createdAt: item.createdAt,
    userVoted: item.userVoted,
    stats: item.stats,
    context: item.context,
  };
}
