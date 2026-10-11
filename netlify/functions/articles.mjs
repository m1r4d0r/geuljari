import { createHandler } from '../../server/articles.mjs';
import { getStore } from '../../server/store.mjs';
export default createHandler(getStore);
export const config = {
  path: ['/api/articles', '/api/articles/:id', '/api/articles/:id/unlock'],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
