/**
 * CMS Cache Utility
 *
 * Provides persistent caching for CMS data using localStorage with:
 * - Stale-while-revalidate pattern for instant loading
 * - TTL (time-to-live) for cache expiration
 * - Selective cache invalidation via webhooks
 * - Fallback to cached data when API is unavailable
 */

const CACHE_PREFIX = 'chirp_cms_cache_'
const CACHE_VERSION = 'v1'
// Use shorter TTL in production (5 minutes) since webhooks require backend infrastructure
// In development, use longer TTL (24 hours) since webhooks work via Vite middleware
const DEFAULT_TTL = import.meta.env.PROD
  ? 1000 * 60 * 5 // 5 minutes in production
  : 1000 * 60 * 60 * 24 // 24 hours in development

export interface CacheEntry<T> {
  data: T
  timestamp: number
  version: string
}

/**
 * Get data from cache
 */
export function getCached<T>(key: string): T | null {
  try {
    const cacheKey = `${CACHE_PREFIX}${CACHE_VERSION}_${key}`
    const cached = localStorage.getItem(cacheKey)

    if (!cached) {
      return null
    }

    const entry: CacheEntry<T> = JSON.parse(cached)

    // Verify version matches
    if (entry.version !== CACHE_VERSION) {
      console.log(`[CMSCache] Version mismatch for ${key}, clearing cache`)
      localStorage.removeItem(cacheKey)
      return null
    }

    return entry.data
  } catch (err) {
    console.error(`[CMSCache] Error reading cache for ${key}:`, err)
    return null
  }
}

/**
 * Check if cached data is stale (older than TTL)
 */
export function isCacheStale(key: string, ttl: number = DEFAULT_TTL): boolean {
  try {
    const cacheKey = `${CACHE_PREFIX}${CACHE_VERSION}_${key}`
    const cached = localStorage.getItem(cacheKey)

    if (!cached) {
      return true
    }

    const entry: CacheEntry<unknown> = JSON.parse(cached)
    const age = Date.now() - entry.timestamp

    return age > ttl
  } catch (err) {
    console.error(`[CMSCache] Error checking cache staleness for ${key}:`, err)
    return true
  }
}

/**
 * Set data in cache
 */
export function setCached<T>(key: string, data: T): void {
  try {
    const cacheKey = `${CACHE_PREFIX}${CACHE_VERSION}_${key}`
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }

    localStorage.setItem(cacheKey, JSON.stringify(entry))
    console.log(`[CMSCache] Cached ${key}`)
  } catch (err) {
    console.error(`[CMSCache] Error writing cache for ${key}:`, err)

    // Handle quota exceeded error by clearing old cache
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      console.warn('[CMSCache] Storage quota exceeded, clearing old cache entries')
      clearOldestCache()

      // Try again after clearing
      try {
        const cacheKey = `${CACHE_PREFIX}${CACHE_VERSION}_${key}`
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          version: CACHE_VERSION,
        }
        localStorage.setItem(cacheKey, JSON.stringify(entry))
      } catch (retryErr) {
        console.error('[CMSCache] Failed to cache even after clearing:', retryErr)
      }
    }
  }
}

/**
 * Clear specific cache entry
 */
export function clearCache(key: string): void {
  try {
    const cacheKey = `${CACHE_PREFIX}${CACHE_VERSION}_${key}`
    localStorage.removeItem(cacheKey)
    console.log(`[CMSCache] Cleared cache for ${key}`)
  } catch (err) {
    console.error(`[CMSCache] Error clearing cache for ${key}:`, err)
  }
}

/**
 * Clear all CMS cache entries
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage)
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX))

    cacheKeys.forEach((key) => localStorage.removeItem(key))
    console.log(`[CMSCache] Cleared ${cacheKeys.length} cache entries`)
  } catch (err) {
    console.error('[CMSCache] Error clearing all cache:', err)
  }
}

/**
 * Clear oldest cache entries to free up space
 */
function clearOldestCache(): void {
  try {
    const keys = Object.keys(localStorage)
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX + CACHE_VERSION))

    // Get timestamps for all cache entries
    const entries = cacheKeys
      .map((key) => {
        try {
          const cached = localStorage.getItem(key)
          if (!cached) return null

          const entry: CacheEntry<unknown> = JSON.parse(cached)
          return { key, timestamp: entry.timestamp }
        } catch {
          return null
        }
      })
      .filter((entry): entry is { key: string; timestamp: number } => entry !== null)

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a.timestamp - b.timestamp)

    // Remove oldest 25% of entries
    const removeCount = Math.ceil(entries.length * 0.25)
    const toRemove = entries.slice(0, removeCount)

    toRemove.forEach(({ key }) => localStorage.removeItem(key))
    console.log(`[CMSCache] Cleared ${toRemove.length} oldest cache entries`)
  } catch (err) {
    console.error('[CMSCache] Error clearing oldest cache:', err)
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalEntries: number
  totalSize: number
  oldestEntry: number | null
  newestEntry: number | null
} {
  try {
    const keys = Object.keys(localStorage)
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX + CACHE_VERSION))

    let totalSize = 0
    let oldestTimestamp: number | null = null
    let newestTimestamp: number | null = null

    cacheKeys.forEach((key) => {
      const cached = localStorage.getItem(key)
      if (cached) {
        totalSize += cached.length

        try {
          const entry: CacheEntry<unknown> = JSON.parse(cached)
          if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
            oldestTimestamp = entry.timestamp
          }
          if (newestTimestamp === null || entry.timestamp > newestTimestamp) {
            newestTimestamp = entry.timestamp
          }
        } catch {
          // Skip invalid entries
        }
      }
    })

    return {
      totalEntries: cacheKeys.length,
      totalSize,
      oldestEntry: oldestTimestamp,
      newestEntry: newestTimestamp,
    }
  } catch (err) {
    console.error('[CMSCache] Error getting cache stats:', err)
    return {
      totalEntries: 0,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
    }
  }
}
