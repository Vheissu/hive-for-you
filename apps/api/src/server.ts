import Fastify from 'fastify';
import cors from '@fastify/cors';

import { forYouConfig } from '../../../packages/shared-config/src/index';
import type { ForYouActionRequest } from '../../../packages/shared-types/src/index';
import { ForYouService } from './store';

const app = Fastify({
  logger: false,
});

const service = new ForYouService();

const DEFAULT_ACCOUNT = (process.env.HIVE_ACCOUNT ?? 'beggars').trim().toLowerCase();

await app.register(cors, {
  origin: true,
});

function resolveAccount(rawAccount?: string) {
  return rawAccount?.trim().toLowerCase() || DEFAULT_ACCOUNT;
}

app.get('/api/for-you', async (request) => {
  const query = request.query as {
    account?: string;
    cursor?: string;
    pageSize?: string;
    refresh?: string;
  };

  return service.buildFeed(resolveAccount(query.account), {
    cursor: query.cursor,
    pageSize: query.pageSize ? Number(query.pageSize) : forYouConfig.pageSizeDefault,
    refresh: query.refresh === 'true',
  });
});

app.post('/api/for-you/actions', async (request) => {
  const body = request.body as ForYouActionRequest;
  const query = request.query as { account?: string };
  return service.applyAction(resolveAccount(query.account), body);
});

app.get('/api/for-you/explain/:author/:permlink', async (request, reply) => {
  const { author, permlink } = request.params as { author: string; permlink: string };
  const query = request.query as { account?: string };
  const explanation = await service.explain(resolveAccount(query.account), `${author}/${permlink}`);

  if (!explanation) {
    return reply.status(404).send({ message: 'Explanation not found' });
  }

  return explanation;
});

app.get('/api/for-you/profile', async (request) => {
  const query = request.query as { account?: string };
  return service.getProfileView(resolveAccount(query.account));
});

app.get('/api/for-you/post/:author/:permlink', async (request, reply) => {
  const { author, permlink } = request.params as { author: string; permlink: string };
  const query = request.query as { account?: string };
  const detail = await service.getPostDetail(resolveAccount(query.account), `${author}/${permlink}`);

  if (!detail) {
    return reply.status(404).send({ message: 'Post not found' });
  }

  return detail;
});

app.post('/api/for-you/reset', async (request) => {
  const query = request.query as { account?: string };
  return service.reset(resolveAccount(query.account));
});

app.get('/internal/for-you/profile/:account', async (request) => {
  const { account } = request.params as { account: string };
  return service.getProfileView(resolveAccount(account));
});

app.get('/internal/for-you/feed/:account', async (request) => {
  const { account } = request.params as { account: string };
  return service.getInternalFeed(resolveAccount(account));
});

app.get('/internal/for-you/post/:author/:permlink', async (request, reply) => {
  const { author, permlink } = request.params as { author: string; permlink: string };
  const query = request.query as { account?: string };
  const post = await service.getPostDetail(resolveAccount(query.account), `${author}/${permlink}`);

  if (!post) {
    return reply.status(404).send({ message: 'Post not found' });
  }

  return post;
});

app.get('/internal/for-you/source-health', async () => service.getSourceHealth());

const port = Number(process.env.PORT || 4318);

app.listen({ host: '0.0.0.0', port }).then(() => {
  console.log(`Hive For You API listening on http://localhost:${port}`);
});
