import { describe, expect, it } from 'vitest';

import { demoHeadBlock, demoPosts } from '../../demo-data/src/index';
import type { NormalizedPost } from '../../shared-types/src/index';
import {
  applyDirectSignal,
  buildCandidateFeatures,
  createEmptyProfile,
  isHardFiltered,
  scoreCandidate,
  similarity,
  toExplainResponse,
} from './index';

function createPost(overrides: Partial<NormalizedPost>): NormalizedPost {
  return {
    postKey: 'author/post',
    author: 'author',
    permlink: 'post',
    rootKey: 'author/post',
    depth: 0,
    community: 'hive-123',
    tags: ['hive', 'writing'],
    title: 'Thoughtful post',
    body: 'A grounded post with enough original detail to be worth reading.',
    bodyPreview: 'A grounded post with enough original detail to be worth reading.',
    app: 'hiveblog',
    language: 'en',
    createdBlock: demoHeadBlock - 1_000,
    format: {
      imageHeavy: false,
      longform: false,
      discussion: false,
      linkPost: false,
      video: false,
    },
    stats: {
      positiveVotes: 45,
      negativeVotes: 0,
      children: 8,
      pendingPayout: 3.4,
      authorReputation: 68,
      hide: false,
      gray: false,
      promoted: 0,
    },
    ...overrides,
  };
}

const emptyOverrides = {
  hiddenPosts: new Set<string>(),
  suppressedAuthors: new Set<string>(),
  suppressedTags: new Set<string>(),
  suppressedCommunities: new Set<string>(),
  boostedAuthors: new Set<string>(),
  boostedTags: new Set<string>(),
  boostedCommunities: new Set<string>(),
};

describe('ranking-core', () => {
  it('scores followed technical posts higher than cold exploration defaults', () => {
    const profile = createEmptyProfile('dwayne', demoHeadBlock);
    profile.topAuthors = [
      {
        key: 'codequill',
        score: 9,
        positive: 3,
        negative: 0,
        exposureCount: 2,
        lastBlock: demoHeadBlock - 1_000,
      },
    ];
    profile.topTags = [
      {
        key: 'typescript',
        score: 8,
        positive: 4,
        negative: 0,
        exposureCount: 3,
        lastBlock: demoHeadBlock - 1_200,
      },
    ];

    const preferredPost = demoPosts.find((post) => post.postKey === 'codequill/latency-budget-field-notes');
    const explorationPost = demoPosts.find((post) => post.postKey === 'nightrelay/midnight-bus-window-lines');

    expect(preferredPost).toBeDefined();
    expect(explorationPost).toBeDefined();

    const preferredFeatures = buildCandidateFeatures(
      { post: preferredPost!, sourceSet: new Set(['followed_authors', 'favorite_tags']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );
    const explorationFeatures = buildCandidateFeatures(
      { post: explorationPost!, sourceSet: new Set(['global_exploration']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );

    expect(scoreCandidate(preferredFeatures)).toBeGreaterThan(scoreCandidate(explorationFeatures));
  });

  it('treats same-author posts as more similar than unrelated ones', () => {
    const left = demoPosts.find((post) => post.postKey === 'codequill/latency-budget-field-notes');
    const right = demoPosts.find((post) => post.postKey === 'atlasbyte/cursor-stability-in-real-feeds');
    const far = demoPosts.find((post) => post.postKey === 'sunthread/neighbourhood-soup-loop');

    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(far).toBeDefined();

    expect(similarity(left!, right!)).toBeGreaterThan(similarity(left!, far!));
  });

  it('maps explanation codes into readable responses', () => {
    const explanation = toExplainResponse(
      'codequill/latency-budget-field-notes',
      {
        followed_author: 1.3,
        tag_match: 0.9,
      },
      new Set(['followed_authors', 'favorite_tags']),
    );

    expect(explanation.reasons[0]?.text).toContain('follow');
    expect(explanation.sourceSet).toContain('favorite_tags');
  });

  it('hard filters Actifit-style report cards', () => {
    const actifitPost = createPost({
      postKey: 'gue22/actifit-gue22-20260309t210130124z',
      author: 'gue22',
      permlink: 'actifit-gue22-20260309t210130124z',
      rootKey: 'gue22/actifit-gue22-20260309t210130124z',
      community: 'hive-193552',
      tags: ['actifit', 'walking', 'move2earn', 'blockchain'],
      title: 'My Actifit Report Card: March 9 2026',
      body: 'This report was published via Actifit app. Check out the original version on actifit.io.',
      bodyPreview: 'This report was published via Actifit app.',
      app: 'actifit',
      stats: {
        positiveVotes: 10,
        negativeVotes: 1,
        children: 1,
        pendingPayout: 0.01,
        authorReputation: 51.62,
        hide: false,
        gray: false,
        promoted: 0,
      },
    });

    expect(isHardFiltered(actifitPost, emptyOverrides, new Set<string>(), false)).toBe(true);
  });

  it('ignores excluded utility accounts when learning author signals', () => {
    const profile = createEmptyProfile('beggars', demoHeadBlock);
    const hivebuzzPost = createPost({
      postKey: 'hivebuzz/badge-drop',
      author: 'hivebuzz',
      permlink: 'badge-drop',
      rootKey: 'hivebuzz/badge-drop',
      community: 'hive-100000',
      title: 'You unlocked a new HiveBuzz badge',
      body: 'HiveBuzz gamification update for your account.',
      bodyPreview: 'HiveBuzz gamification update for your account.',
      app: 'hivebuzz',
      stats: {
        positiveVotes: 12,
        negativeVotes: 0,
        children: 0,
        pendingPayout: 0,
        authorReputation: 61,
        hide: false,
        gray: false,
        promoted: 0,
      },
    });

    const afterVote = applyDirectSignal(profile, 'positive_vote', demoHeadBlock, hivebuzzPost);
    const afterFollow = applyDirectSignal(afterVote, 'follow', demoHeadBlock, undefined, 'hivebuzz');

    expect(isHardFiltered(hivebuzzPost, emptyOverrides, new Set<string>(), false)).toBe(true);
    expect(afterFollow.topAuthors).toEqual([]);
    expect(afterFollow.topApps).toEqual([]);
  });

  it('scores thoughtful posts above market-promo spam', () => {
    const profile = createEmptyProfile('beggars', demoHeadBlock);
    profile.topTags = [
      {
        key: 'blockchain',
        score: 6,
        positive: 2,
        negative: 0,
        exposureCount: 1,
        lastBlock: demoHeadBlock - 2_000,
      },
    ];

    const thoughtfulPost = createPost({});
    const promoPost = createPost({
      postKey: 'lovlygirl/flow-pumps-16-78-today',
      author: 'lovlygirl',
      permlink: 'flow-pumps-16-78-today',
      rootKey: 'lovlygirl/flow-pumps-16-78-today',
      title: 'FLOW Pumps +16.78% Today Layer-1 Gaming Token Rising on Binance!',
      body: 'Current price and 24h change on Binance. Massive breakout.',
      bodyPreview: 'Current price and 24h change on Binance.',
      tags: ['crypto', 'blockchain', 'finance', 'hive', 'leofinance', 'news'],
      community: 'hive-163068',
      stats: {
        positiveVotes: 3,
        negativeVotes: 0,
        children: 2,
        pendingPayout: 0,
        authorReputation: 57,
        hide: false,
        gray: false,
        promoted: 0,
      },
    });

    const thoughtfulFeatures = buildCandidateFeatures(
      { post: thoughtfulPost, sourceSet: new Set(['favorite_tags', 'global_quality']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );
    const promoFeatures = buildCandidateFeatures(
      { post: promoPost, sourceSet: new Set(['favorite_tags', 'global_quality']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );

    expect(scoreCandidate(thoughtfulFeatures)).toBeGreaterThan(scoreCandidate(promoFeatures));
  });

  it('ignores low-signal platform tags when computing tag affinity', () => {
    const profile = createEmptyProfile('beggars', demoHeadBlock);
    profile.topTags = [
      {
        key: 'blockchain',
        score: 8,
        positive: 3,
        negative: 0,
        exposureCount: 1,
        lastBlock: demoHeadBlock - 2_000,
      },
      {
        key: 'writing',
        score: 4,
        positive: 1,
        negative: 0,
        exposureCount: 1,
        lastBlock: demoHeadBlock - 2_000,
      },
    ];

    const genericTagPost = createPost({
      tags: ['hive', 'blockchain', 'crypto'],
      title: 'Platform update',
    });
    const meaningfulTagPost = createPost({
      tags: ['writing', 'essay'],
      title: 'Writing in public',
    });

    const genericFeatures = buildCandidateFeatures(
      { post: genericTagPost, sourceSet: new Set(['favorite_tags']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );
    const meaningfulFeatures = buildCandidateFeatures(
      { post: meaningfulTagPost, sourceSet: new Set(['favorite_tags']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );

    expect(genericFeatures.tagAffinity).toBe(0);
    expect(meaningfulFeatures.tagAffinity).toBeGreaterThan(0);
  });

  it('downranks roundup posts and penalizes repeated curation authors harder', () => {
    const profile = createEmptyProfile('beggars', demoHeadBlock);
    profile.topTags = [
      {
        key: 'writing',
        score: 6,
        positive: 2,
        negative: 0,
        exposureCount: 1,
        lastBlock: demoHeadBlock - 2_000,
      },
    ];

    const thoughtfulPost = createPost({
      title: 'What writing in public changed for me',
      body: 'A reflective piece with concrete takeaways from writing consistently on Hive.',
      bodyPreview: 'A reflective piece with concrete takeaways from writing consistently on Hive.',
      tags: ['writing', 'community'],
    });
    const roundupPost = createPost({
      postKey: 'daily-mix/hive-daily-mix-gaming-2026-03-10',
      author: 'daily-mix',
      permlink: 'hive-daily-mix-gaming-2026-03-10',
      rootKey: 'daily-mix/hive-daily-mix-gaming-2026-03-10',
      title: 'Hive Daily Mix - Gaming - 2026-03-10',
      body: 'Curated by our team. Featured posts and winning entries from around the community with short summaries.',
      bodyPreview: 'Curated by our team. Featured posts and winning entries from around the community.',
      tags: ['writing', 'curation', 'community'],
      community: 'hive-123',
      stats: {
        positiveVotes: 42,
        negativeVotes: 0,
        children: 4,
        pendingPayout: 1.5,
        authorReputation: 63,
        hide: false,
        gray: false,
        promoted: 0,
      },
    });

    const thoughtfulFeatures = buildCandidateFeatures(
      { post: thoughtfulPost, sourceSet: new Set(['favorite_tags', 'global_quality']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );
    const roundupOnceFeatures = buildCandidateFeatures(
      { post: roundupPost, sourceSet: new Set(['favorite_tags', 'global_quality']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );
    const roundupRepeatedFeatures = buildCandidateFeatures(
      { post: roundupPost, sourceSet: new Set(['favorite_tags', 'global_quality']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      3,
    );

    expect(scoreCandidate(thoughtfulFeatures)).toBeGreaterThan(scoreCandidate(roundupOnceFeatures));
    expect(scoreCandidate(roundupOnceFeatures)).toBeGreaterThan(scoreCandidate(roundupRepeatedFeatures));
  });

  it('downranks hypey announcement posts against substantive posts', () => {
    const profile = createEmptyProfile('beggars', demoHeadBlock);
    profile.topTags = [
      {
        key: 'hive',
        score: 5,
        positive: 2,
        negative: 0,
        exposureCount: 1,
        lastBlock: demoHeadBlock - 2_000,
      },
    ];

    const thoughtfulPost = createPost({
      title: 'How witness price feeds actually work',
      body: 'A plain-language breakdown of witness price feeds, failure modes, and why they matter.',
      bodyPreview: 'A plain-language breakdown of witness price feeds.',
      tags: ['hive', 'witness'],
    });
    const announcementPost = createPost({
      postKey: 'communitybuzz/hive-thrive-47-countdown',
      author: 'communitybuzz',
      permlink: 'hive-thrive-47-countdown',
      rootKey: 'communitybuzz/hive-thrive-47-countdown',
      title: 'TWO Hours Until Hive Thrive #47 with @lordbutterfly',
      body: 'Get ready. Join us live, set a reminder, and don’t miss the community hour stream.',
      bodyPreview: 'Get ready. Join us live and set a reminder.',
      tags: ['hive', 'community'],
      stats: {
        positiveVotes: 30,
        negativeVotes: 0,
        children: 2,
        pendingPayout: 0.8,
        authorReputation: 61,
        hide: false,
        gray: false,
        promoted: 0,
      },
    });

    const thoughtfulFeatures = buildCandidateFeatures(
      { post: thoughtfulPost, sourceSet: new Set(['favorite_tags', 'global_quality']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );
    const announcementFeatures = buildCandidateFeatures(
      { post: announcementPost, sourceSet: new Set(['favorite_tags', 'global_quality']), rebloggedBy: [] },
      profile,
      emptyOverrides,
      new Set<string>(),
      demoHeadBlock,
      1,
    );

    expect(scoreCandidate(thoughtfulFeatures)).toBeGreaterThan(scoreCandidate(announcementFeatures));
  });
});
