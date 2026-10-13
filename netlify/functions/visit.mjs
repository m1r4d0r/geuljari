import { createVisitHandler, getStats } from '../../server/stats.mjs';
export default createVisitHandler(getStats);
export const config = {
  path: '/api/visit',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
