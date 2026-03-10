import type { ChainEventSeed, NormalizedPost, SimilarUser } from '../../shared-types/src/index';

export const demoHeadBlock = 98_234_210;

type DemoAccountGraph = {
  follows: string[];
  communities: string[];
  similarUsers: SimilarUser[];
};

type RawPost = {
  author: string;
  permlink: string;
  community?: string;
  tags: string[];
  title: string;
  body: string;
  image?: string;
  app?: string;
  language?: string;
  createdBlock: number;
  positiveVotes: number;
  negativeVotes: number;
  children: number;
  pendingPayout?: number;
  authorReputation?: number;
  gray?: boolean;
  hide?: boolean;
  promoted?: number;
  rebloggedBy?: string[];
};

function deriveFormat(post: Pick<RawPost, 'app' | 'body' | 'image' | 'tags' | 'title'>) {
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

function toPreview(body: string) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 184) + '...';
}

function createPost(raw: RawPost): NormalizedPost {
  const postKey = `${raw.author}/${raw.permlink}`;

  return {
    postKey,
    author: raw.author,
    permlink: raw.permlink,
    rootKey: postKey,
    depth: 0,
    community: raw.community,
    tags: [...new Set(raw.tags.map((tag) => tag.toLowerCase()))],
    title: raw.title,
    body: raw.body,
    bodyPreview: toPreview(raw.body),
    image: raw.image,
    app: raw.app,
    language: raw.language ?? 'en',
    createdBlock: raw.createdBlock,
    format: deriveFormat(raw),
    stats: {
      positiveVotes: raw.positiveVotes,
      negativeVotes: raw.negativeVotes,
      children: raw.children,
      netRshares: String((raw.positiveVotes - raw.negativeVotes) * 1000),
      pendingPayout: raw.pendingPayout,
      authorReputation: raw.authorReputation,
      hide: raw.hide ?? false,
      gray: raw.gray ?? false,
      promoted: raw.promoted ?? 0,
    },
  };
}

const rawPosts: RawPost[] = [
  {
    author: 'codequill',
    permlink: 'latency-budget-field-notes',
    community: 'devhive',
    tags: ['typescript', 'performance', 'architecture'],
    title: 'Latency budgets are a product feature, not a backend afterthought',
    body: 'I spent the week tightening a feed pipeline that looked healthy on paper but buckled in production. The fix was not more cache. It was budgeting latency across query shaping, hydration, ranking, and rendering so each stage had a fixed ceiling. The surprising part was how much better the product discussion became once the numbers were visible to everyone.',
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 2_340,
    positiveVotes: 189,
    negativeVotes: 4,
    children: 32,
    pendingPayout: 38.1,
    authorReputation: 67,
  },
  {
    author: 'lenslog',
    permlink: 'blue-hour-ferry-deck',
    community: 'lens-lounge',
    tags: ['photography', 'city', 'night'],
    title: 'Blue hour from the ferry deck',
    body: 'The river looked like brushed steel tonight and every cabin light made a stripe across the water. I kept the framing simple and let the wake do the work. Sometimes the shot is just waiting for you to stop over-directing it.',
    image: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 1_420,
    positiveVotes: 142,
    negativeVotes: 1,
    children: 11,
    pendingPayout: 21.6,
    authorReputation: 71,
  },
  {
    author: 'gardenmint',
    permlink: 'soil-calendar-for-small-yards',
    community: 'homestead',
    tags: ['gardening', 'soil', 'homestead'],
    title: 'A soil calendar for small backyards',
    body: 'I finally wrote down the messy pattern that keeps our little patch productive. The whole trick is alternating compost moisture, shallow cover, and fast crops so the bed never swings too far dry or sour. It is not glamorous, but it keeps the tomatoes honest.',
    image: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 3_810,
    positiveVotes: 118,
    negativeVotes: 2,
    children: 19,
    pendingPayout: 17.2,
    authorReputation: 66,
  },
  {
    author: 'storyforge',
    permlink: 'the-week-i-stopped-writing-hooks',
    community: 'culturegrid',
    tags: ['writing', 'productivity', 'creative'],
    title: 'The week I stopped writing hooks first',
    body: 'A friend challenged me to draft the center of a story before the opening line. It felt backward and then embarrassingly obvious. Once the middle knew what it was trying to protect, the beginning stopped performing and started inviting.',
    image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 4_220,
    positiveVotes: 104,
    negativeVotes: 3,
    children: 27,
    pendingPayout: 15.9,
    authorReputation: 69,
    rebloggedBy: ['emberlane'],
  },
  {
    author: 'reefpulse',
    permlink: 'tide-monitoring-on-a-budget',
    community: 'reefwatch',
    tags: ['science', 'ocean', 'diy'],
    title: 'Building a tide monitor with parts I already had',
    body: 'The sensor stack is gloriously imperfect but it has been enough to map a month of tidal quirks and stop me from showing up at the wrong time. The nicest side effect is that the setup is small enough to explain to students without losing them.',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 7_650,
    positiveVotes: 156,
    negativeVotes: 6,
    children: 36,
    pendingPayout: 24.8,
    authorReputation: 72,
  },
  {
    author: 'atlasbyte',
    permlink: 'cursor-stability-in-real-feeds',
    community: 'devhive',
    tags: ['typescript', 'feeds', 'backend'],
    title: 'Cursor stability is the difference between a feed and a slot machine',
    body: 'If the second page changes while the user is reading the first page, the ranking system becomes impossible to trust. Snapshots are not glamorous and they are not the fastest thing to prototype, but they are the first thing I add now whenever a feed matters.',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 2_860,
    positiveVotes: 173,
    negativeVotes: 2,
    children: 41,
    pendingPayout: 34.5,
    authorReputation: 73,
    rebloggedBy: ['codequill', 'dwayne'],
  },
  {
    author: 'emberlane',
    permlink: 'warm-light-on-rain-brick',
    community: 'lens-lounge',
    tags: ['photography', 'street', 'rain'],
    title: 'Warm light on rain brick',
    body: 'I did not mean to stop under the awning for long, but the alley kept rewriting itself every ten seconds. The best frame ended up being the quietest one: no umbrella, no pedestrian, just reflected cafe light climbing the bricks.',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 5_110,
    positiveVotes: 128,
    negativeVotes: 2,
    children: 14,
    pendingPayout: 18.3,
    authorReputation: 68,
  },
  {
    author: 'solthread',
    permlink: 'fermentation-logbook-v2',
    community: 'homestead',
    tags: ['food', 'fermentation', 'homestead'],
    title: 'Fermentation logbook version two',
    body: 'The first notebook taught me that memory is far too flattering when jars are involved. The second version is less pretty and much more useful. Salt percentage, room temperature, smell notes, and the exact day I became impatient all go on the page now.',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 6_480,
    positiveVotes: 97,
    negativeVotes: 1,
    children: 18,
    pendingPayout: 13.1,
    authorReputation: 65,
    rebloggedBy: ['gardenmint'],
  },
  {
    author: 'trailgrain',
    permlink: 'overnight-rail-and-notes',
    community: 'wanderhive',
    tags: ['travel', 'journal', 'writing'],
    title: 'Notes from the overnight rail carriage',
    body: 'No grand lesson here, just the strange competence that shows up in shared transit. Someone always knows where the tea is, someone else knows when the service stops, and by sunrise the cabin feels like a temporary village with luggage racks.',
    image: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 8_420,
    positiveVotes: 111,
    negativeVotes: 3,
    children: 16,
    pendingPayout: 16.4,
    authorReputation: 64,
  },
  {
    author: 'chainframe',
    permlink: 'one-column-ui-is-a-power-move',
    community: 'devhive',
    tags: ['design', 'frontend', 'ux'],
    title: 'Single-column interfaces are a power move when the ranking story matters',
    body: 'The first instinct is always to add more rails, more cards, more auxiliary panels. But if the feed itself is the product, the ranking story deserves the quietest, clearest stage you can give it. The side rail should support the feed, not challenge it.',
    image: 'https://images.unsplash.com/photo-1522542550221-31fd19575a2d?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 3_040,
    positiveVotes: 146,
    negativeVotes: 5,
    children: 23,
    pendingPayout: 20.2,
    authorReputation: 70,
  },
  {
    author: 'vinyldawn',
    permlink: 'late-set-jazz-for-tuesday',
    community: 'culturegrid',
    tags: ['music', 'jazz', 'playlist'],
    title: 'Five late-set jazz tracks for a Tuesday reset',
    body: 'This is a short playlist for anyone whose brain has too many browser tabs open. Brass that never shouts, drums that remember restraint, and one piano run that sounds like a skyline seeing itself in a window after dark.',
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 9_120,
    positiveVotes: 92,
    negativeVotes: 1,
    children: 12,
    pendingPayout: 12.6,
    authorReputation: 63,
  },
  {
    author: 'beaconbrew',
    permlink: 'coffee-cart-layout-lessons',
    community: 'culturegrid',
    tags: ['coffee', 'smallbusiness', 'design'],
    title: 'What a coffee cart taught me about layout systems',
    body: 'Every object on the cart earns its place because every misplaced gesture slows the line. I keep coming back to that when I design interfaces. If the user has to weave around decorative decisions to finish a task, the design is serving itself.',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 5_540,
    positiveVotes: 88,
    negativeVotes: 4,
    children: 9,
    pendingPayout: 10.8,
    authorReputation: 62,
  },
  {
    author: 'microkay',
    permlink: 'ragebait-blocks-engagement',
    community: 'devhive',
    tags: ['meta', 'growth', 'controversy'],
    title: 'Does ragebait actually make communities stronger?',
    body: 'This post asks a useful question and then pushes a little too hard in the direction of heat. The comments are energetic, but the pattern is familiar: more reaction than reflection and not much signal once the sparks settle.',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 2_050,
    positiveVotes: 34,
    negativeVotes: 29,
    children: 67,
    pendingPayout: 4.2,
    authorReputation: 47,
    gray: true,
  },
  {
    author: 'mossledger',
    permlink: 'after-dark-ledger',
    community: 'culturegrid',
    tags: ['nsfw', 'nightlife'],
    title: 'After dark ledger',
    body: 'An intentionally provocative nightlife diary meant for adult audiences.',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 1_880,
    positiveVotes: 51,
    negativeVotes: 8,
    children: 4,
    pendingPayout: 7.7,
    authorReputation: 55,
  },
  {
    author: 'gridpilot',
    permlink: 'quiet-cache-invalidation-win',
    community: 'devhive',
    tags: ['typescript', 'infra', 'backend'],
    title: 'A very quiet cache invalidation win',
    body: 'The release notes would make this sound dull, which is exactly what you want from infrastructure. A fast path now collapses three near-identical reads into one stable snapshot lookup. No fireworks, just a support inbox that went strangely quiet.',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 980,
    positiveVotes: 131,
    negativeVotes: 0,
    children: 17,
    pendingPayout: 19.4,
    authorReputation: 69,
    rebloggedBy: ['atlasbyte'],
  },
  {
    author: 'harborprint',
    permlink: 'paper-stock-for-photo-zines',
    community: 'lens-lounge',
    tags: ['photography', 'print', 'zines'],
    title: 'Paper stock for photo zines without guesswork',
    body: 'The wrong paper can flatten a sequence faster than a bad crop. I tested three affordable stocks with the same moody set and only one kept the blacks deep without turning the highlights waxy. Here are the scans and the disappointment curve.',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 6_010,
    positiveVotes: 116,
    negativeVotes: 1,
    children: 13,
    pendingPayout: 14.7,
    authorReputation: 67,
  },
  {
    author: 'fieldatlas',
    permlink: 'shade-mapping-for-porch-herbs',
    community: 'homestead',
    tags: ['gardening', 'herbs', 'smallspace'],
    title: 'Shade mapping for porch herbs',
    body: 'I spent two weeks drawing rectangles of light across the porch because I was tired of pretending basil likes ambiguity. The resulting map is simple, repeatable, and honest enough that I moved half the pots and immediately stopped blaming the seedlings.',
    image: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=1200&q=80',
    app: 'peakd/1.0',
    createdBlock: demoHeadBlock - 4_960,
    positiveVotes: 103,
    negativeVotes: 2,
    children: 15,
    pendingPayout: 13.8,
    authorReputation: 64,
  },
  {
    author: 'sunthread',
    permlink: 'neighbourhood-soup-loop',
    community: 'homestead',
    tags: ['food', 'community', 'story'],
    title: 'The neighbourhood soup loop',
    body: 'Three households accidentally built a weekly soup exchange because nobody wanted to waste the extra stock. By week four there was a rotation, hand-written labels, and a surprising amount of gossip about lentils.',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 7_140,
    positiveVotes: 94,
    negativeVotes: 1,
    children: 20,
    pendingPayout: 12.1,
    authorReputation: 61,
  },
  {
    author: 'nightrelay',
    permlink: 'midnight-bus-window-lines',
    community: 'wanderhive',
    tags: ['travel', 'photography', 'night'],
    title: 'Midnight bus window lines',
    body: 'Everything on night buses either disappears or turns cinematic. I was chasing reflections and accidentally documented a dozen little rituals of long-distance travel instead: neck pillows, folded jackets, glowing map apps, and one very patient driver.',
    image: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
    app: 'ecency/4.0',
    createdBlock: demoHeadBlock - 10_200,
    positiveVotes: 107,
    negativeVotes: 3,
    children: 10,
    pendingPayout: 11.5,
    authorReputation: 60,
  },
];

export const demoPosts = rawPosts.map(createPost);

export const demoReblogs = rawPosts.flatMap((post) =>
  (post.rebloggedBy ?? []).map((by) => ({
    postKey: `${post.author}/${post.permlink}`,
    by,
  })),
);

export const demoAccounts: Record<string, DemoAccountGraph> = {
  dwayne: {
    follows: ['codequill', 'lenslog', 'gardenmint', 'storyforge'],
    communities: ['devhive', 'lens-lounge', 'homestead'],
    similarUsers: [
      { account: 'emberlane', score: 0.82 },
      { account: 'atlasbyte', score: 0.74 },
      { account: 'solthread', score: 0.71 },
    ],
  },
  emberlane: {
    follows: ['lenslog', 'storyforge', 'harborprint'],
    communities: ['lens-lounge', 'culturegrid'],
    similarUsers: [
      { account: 'dwayne', score: 0.82 },
      { account: 'nightrelay', score: 0.66 },
    ],
  },
  atlasbyte: {
    follows: ['codequill', 'gridpilot', 'chainframe'],
    communities: ['devhive'],
    similarUsers: [
      { account: 'dwayne', score: 0.74 },
      { account: 'gridpilot', score: 0.68 },
    ],
  },
  solthread: {
    follows: ['gardenmint', 'fieldatlas', 'sunthread'],
    communities: ['homestead'],
    similarUsers: [
      { account: 'dwayne', score: 0.71 },
      { account: 'gardenmint', score: 0.65 },
    ],
  },
};

export const demoSeedEvents: Record<string, ChainEventSeed[]> = {
  dwayne: [
    { account: 'dwayne', type: 'follow', entityKey: 'codequill', blockNumber: demoHeadBlock - 18_000 },
    { account: 'dwayne', type: 'follow', entityKey: 'lenslog', blockNumber: demoHeadBlock - 17_000 },
    { account: 'dwayne', type: 'follow', entityKey: 'gardenmint', blockNumber: demoHeadBlock - 16_500 },
    { account: 'dwayne', type: 'subscribe_community', entityKey: 'devhive', blockNumber: demoHeadBlock - 15_000 },
    { account: 'dwayne', type: 'subscribe_community', entityKey: 'lens-lounge', blockNumber: demoHeadBlock - 14_400 },
    { account: 'dwayne', type: 'subscribe_community', entityKey: 'homestead', blockNumber: demoHeadBlock - 14_000 },
    { account: 'dwayne', type: 'positive_vote', postKey: 'codequill/latency-budget-field-notes', blockNumber: demoHeadBlock - 2_200 },
    { account: 'dwayne', type: 'open_post', postKey: 'lenslog/blue-hour-ferry-deck', blockNumber: demoHeadBlock - 1_300 },
    { account: 'dwayne', type: 'engaged_read', postKey: 'atlasbyte/cursor-stability-in-real-feeds', blockNumber: demoHeadBlock - 2_400 },
    { account: 'dwayne', type: 'engaged_read', postKey: 'gardenmint/soil-calendar-for-small-yards', blockNumber: demoHeadBlock - 3_700 },
    { account: 'dwayne', type: 'comment', postKey: 'storyforge/the-week-i-stopped-writing-hooks', blockNumber: demoHeadBlock - 4_000 },
    { account: 'dwayne', type: 'reblog', postKey: 'atlasbyte/cursor-stability-in-real-feeds', blockNumber: demoHeadBlock - 2_200 },
  ],
  emberlane: [
    { account: 'emberlane', type: 'follow', entityKey: 'lenslog', blockNumber: demoHeadBlock - 18_500 },
    { account: 'emberlane', type: 'subscribe_community', entityKey: 'lens-lounge', blockNumber: demoHeadBlock - 16_400 },
    { account: 'emberlane', type: 'engaged_read', postKey: 'storyforge/the-week-i-stopped-writing-hooks', blockNumber: demoHeadBlock - 4_300 },
    { account: 'emberlane', type: 'positive_vote', postKey: 'lenslog/blue-hour-ferry-deck', blockNumber: demoHeadBlock - 1_100 },
  ],
  atlasbyte: [
    { account: 'atlasbyte', type: 'follow', entityKey: 'codequill', blockNumber: demoHeadBlock - 19_300 },
    { account: 'atlasbyte', type: 'subscribe_community', entityKey: 'devhive', blockNumber: demoHeadBlock - 17_100 },
    { account: 'atlasbyte', type: 'engaged_read', postKey: 'gridpilot/quiet-cache-invalidation-win', blockNumber: demoHeadBlock - 910 },
    { account: 'atlasbyte', type: 'positive_vote', postKey: 'chainframe/one-column-ui-is-a-power-move', blockNumber: demoHeadBlock - 2_900 },
  ],
  solthread: [
    { account: 'solthread', type: 'follow', entityKey: 'gardenmint', blockNumber: demoHeadBlock - 15_500 },
    { account: 'solthread', type: 'subscribe_community', entityKey: 'homestead', blockNumber: demoHeadBlock - 15_300 },
    { account: 'solthread', type: 'engaged_read', postKey: 'fieldatlas/shade-mapping-for-porch-herbs', blockNumber: demoHeadBlock - 4_800 },
    { account: 'solthread', type: 'comment', postKey: 'sunthread/neighbourhood-soup-loop', blockNumber: demoHeadBlock - 6_900 },
  ],
};

