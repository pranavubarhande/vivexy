import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
});

export const getCache = async (key: string): Promise<string | null> => {
  try {
    return await redis.get(key);
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

export const setCache = async (
  key: string,
  value: string,
  ttlSeconds: number = 3600
): Promise<void> => {
  try {
    await redis.setex(key, ttlSeconds, value);
  } catch (error) {
    console.error('Cache set error:', error);
  }
};

export const deleteCache = async (key: string): Promise<void> => {
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
};

export const cacheWrapper = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 3600
): Promise<T> => {
  const cached = await getCache(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error('Cache parse error:', error);
    }
  }

  const data = await fetcher();
  await setCache(key, JSON.stringify(data), ttlSeconds);
  return data;
};