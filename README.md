# Hive For You

Deterministic implementation of the Hive personalized "For You" feed from [tech-spec.md](/Users/dwayne/Code/hive-for-you/tech-spec.md), backed by live Hive RPC data.

## What is in this repo

- `apps/api`: Fastify API with feed ranking, explanation, feedback, reset, and live Hive bridge endpoints
- `apps/web`: React client for the `/for-you` experience
- `apps/worker`: worker entry point for future materialization jobs
- `packages/ranking-core`: deterministic scoring, filtering, diversity, and explanation logic
- `packages/demo-data`: legacy fixtures used by tests
- `packages/shared-types` and `packages/shared-config`: shared contracts and algorithm settings

## Running locally

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173/for-you`
- API: `http://localhost:4318/api/for-you`

## Account and recency

- The UI defaults to Hive account `@beggars`.
- Feed candidates are constrained to the last 48 hours.
- Ranking is biased toward recent posts with stronger vote/reply activity.

You can override the account for local development with `HIVE_ACCOUNT` and `VITE_HIVE_ACCOUNT`, but the shipped UI no longer exposes demo-account switching.

## Interactions

- Read full posts in-app through the reader dialog.
- Open any post on PeakD from the feed.
- Vote or flag directly from the feed when Hive Keychain is installed.
- Feed explanations stay available through the "Why this?" dialog.

## Notes

- The production spec calls for HAF/HAFsql plus MongoDB. This repo keeps those boundaries but currently uses a live Hive RPC bridge instead of those production adapters.
- Ranking is deterministic and explainable. Every feed item carries reason codes, and the API exposes a dedicated explanation endpoint.
