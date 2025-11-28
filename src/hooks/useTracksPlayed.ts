// src/hooks/useTracksPlayed.ts
// Hook for fetching tracks played with caching (stale-while-revalidate pattern)

import { useState, useEffect } from 'react'
import {
  getTracksPlayed,
  getRecentTracksPlayed,
  shouldRefreshTracksPlayed,
} from '../utils/tracksPlayedDB'
import { getCached } from '../utils/cmsCache'
import type { TrackPlayed } from '../types/tracksPlayed'

interface UseTracksPlayedOptions {
  limit?: number
  page?: number
  autoFetch?: boolean
}

interface UseTracksPlayedReturn {
  data: TrackPlayed[]
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

/**
 * Hook to fetch tracks played (last 6 months)
 * Uses stale-while-revalidate pattern like CMSContext
 */
export function useTracksPlayed(options?: UseTracksPlayedOptions): UseTracksPlayedReturn {
  const { limit = 100, page = 1, autoFetch = true } = options || {}

  const [data, setData] = useState<TrackPlayed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchTracks = async () => {
    try {
      const cacheKey = `tracks-played-p${page}-l${limit}`

      // Step 1: Load from cache immediately
      const cached = getCached<TrackPlayed[]>(cacheKey)
      if (cached) {
        console.log('[useTracksPlayed] Loading from cache')
        setData(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }

      // Step 2: Check if we need to fetch (cache is stale or empty)
      if (!cached || shouldRefreshTracksPlayed()) {
        console.log('[useTracksPlayed] Fetching fresh data')
        const freshData = await getTracksPlayed({ limit, page })
        setData(freshData)
        setError(null)
      }
    } catch (err) {
      console.error('[useTracksPlayed] Error fetching tracks:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoFetch) {
      fetchTracks()

      // Auto-refresh every 15 seconds
      const interval = setInterval(() => {
        fetchTracks()
      }, 15000)

      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, page, autoFetch])

  return {
    data,
    loading,
    error,
    refresh: fetchTracks,
  }
}

/**
 * Hook to fetch recent tracks (for landing page - last 6 tracks)
 */
export function useRecentTracksPlayed(count: number = 6): UseTracksPlayedReturn {
  const [data, setData] = useState<TrackPlayed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchTracks = async () => {
    try {
      setLoading(true)
      const tracks = await getRecentTracksPlayed(count)
      setData(tracks)
      setError(null)
    } catch (err) {
      console.error('[useRecentTracksPlayed] Error fetching tracks:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTracks()

    // Auto-refresh every 15 seconds
    const interval = setInterval(() => {
      fetchTracks()
    }, 15000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  return {
    data,
    loading,
    error,
    refresh: fetchTracks,
  }
}
