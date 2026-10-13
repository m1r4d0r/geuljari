import { readFileSync } from 'node:fs';
import { getStore } from '../../server/store.mjs';
import { createReaderHandler } from '../../server/reader-page.mjs';
import { getStats } from '../../server/stats.mjs';
export default createReaderHandler(getStore, readFileSync('published.html', 'utf8'), getStats);
export const config = {
  path: '/t/:id',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
