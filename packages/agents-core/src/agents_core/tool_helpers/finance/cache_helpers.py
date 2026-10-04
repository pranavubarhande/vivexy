import json
import os

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

redis_client = redis.from_url(REDIS_URL, decode_responses=True)


def get_cache(key: str) -> str | None:
    """Get value from cache."""
    try:
        return redis_client.get(key)
    except Exception as e:
        print(f"Cache get error: {e}")
        return None


def set_cache(key: str, value: str, ttl_seconds: int = 3600) -> None:
    """Set value in cache with TTL."""
    try:
        redis_client.setex(key, ttl_seconds, value)
    except Exception as e:
        print(f"Cache set error: {e}")


def delete_cache(key: str) -> None:
    """Delete value from cache."""
    try:
        redis_client.delete(key)
    except Exception as e:
        print(f"Cache delete error: {e}")


def cache_wrapper(key: str, fetcher, ttl_seconds: int = 3600):
    """Cache wrapper that fetches data if not cached."""
    cached = get_cache(key)
    if cached:
        try:
            return json.loads(cached)
        except Exception as e:
            print(f"Cache parse error: {e}")
            pass

    data = fetcher()
    set_cache(key, json.dumps(data), ttl_seconds)
    return data
