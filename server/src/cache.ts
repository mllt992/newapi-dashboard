import Redis from 'ioredis';
import config from './config.js';

const redis = new Redis(config.REDIS_CONN_STRING, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 3000);
  },
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

/**
 * 带缓存的查询包装器
 */
export async function withCache<T>(key: string, ttlSec: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fetcher();
  await redis.setex(key, ttlSec, JSON.stringify(data));
  return data;
}

export default redis;
