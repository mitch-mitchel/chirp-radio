// Utility functions for fetching tracks played from CMS API

import type { TrackPlayed, TracksPlayedResponse } from '../types/tracksPlayed'
import { setCached, getCached } from './cmsCache'

const CMS_BASE_URL = import.meta.env.VITE_CMS_API_URL || 'http://localhost:3000/api'
const TRACKS_CACHE_KEY = 'tracks-played-cache'
const TRACKS_TIMESTAMP_KEY = 'tracks-played-timestamp'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

interface GetTracksPlayedOptions {
  limit?: number
  page?: number
  since?: Date
}

/**
 * Fetch tracks played from CMS API
 */
export async function getTracksPlayed(options?: GetTracksPlayedOptions): Promise<TrackPlayed[]> {
  const { limit = 200, page = 1, since } = options || {}

  try {
    // Build query params
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
      sort: '-playedAt', // Most recent first
    })

    // Add date filter if provided (for last 6 months)
    if (since) {
      params.append(
        'where',
        JSON.stringify({
          playedAt: {
            greater_than: since.toISOString(),
          },
        })
      )
    } else {
      // Default: last 6 months
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      params.append(
        'where',
        JSON.stringify({
          playedAt: {
            greater_than: sixMonthsAgo.toISOString(),
          },
        })
      )
    }

    const url = `${CMS_BASE_URL}/tracks-played?${params.toString()}`
    console.log('[tracksPlayedDB] Fetching from:', url)

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch tracks: ${response.status} ${response.statusText}`)
    }

    const data: TracksPlayedResponse = await response.json()

    // Cache the results
    setCached(TRACKS_CACHE_KEY, data.docs)
    setCached(TRACKS_TIMESTAMP_KEY, Date.now())

    return data.docs
  } catch (error) {
    console.error('[tracksPlayedDB] Error fetching tracks:', error)

    // Return cached data if available
    const cached = getCached<TrackPlayed[]>(TRACKS_CACHE_KEY)
    if (cached) {
      console.log('[tracksPlayedDB] Returning cached data due to error')
      return cached
    }

    throw error
  }
}

/**
 * Fetch recent tracks (for landing page)
 */
export async function getRecentTracksPlayed(count: number = 6): Promise<TrackPlayed[]> {
  const tracks = await getTracksPlayed({ limit: count, page: 1 })
  return tracks.slice(0, count)
}

/**
 * Check if we should refresh tracks cache
 */
export function shouldRefreshTracksPlayed(): boolean {
  const timestamp = getCached<number>(TRACKS_TIMESTAMP_KEY)
  if (!timestamp) return true

  const now = Date.now()
  return now - timestamp > CACHE_DURATION
}
