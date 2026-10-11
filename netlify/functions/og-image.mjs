import { createImageHandler } from '../../server/og-image.mjs';
import { getStore } from '../../server/store.mjs';
export default createImageHandler(getStore);
export const config = {
  path:'/og/:id/:image',
  rateLimit:{ windowLimit:120, windowSize:60, aggregateBy:['ip','domain'] }
};
