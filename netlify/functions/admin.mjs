import { createAdminHandler } from '../../server/admin.mjs';
import { getStore } from '../../server/store.mjs';
import { getStats } from '../../server/stats.mjs';
export default createAdminHandler(getStore, getStats, () => process.env.GEULJARI_ADMIN_PASSWORD || '');
export const config = {
  path: '/api/admin',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
