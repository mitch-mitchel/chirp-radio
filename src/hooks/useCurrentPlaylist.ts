// Hook to fetch the current playlist from CHIRP Radio API
// Returns all 6 songs (now_playing + recently_played)

import { useState, useEffect, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { CapacitorHttp } from '@capacitor/core'
import { upgradeImageQuality } from '../utils/imageOptimizer'
import { usePlayerFallbackImages } from './useData'
import { getRandomFallback } from '../utils/albumArtFallback'
import { on } from '../utils/eventBus'

interface ChirpSong {
  id: string
  artist: string
  track: string
  release?: string
  label?: string
  dj: string
  notes?: string
  played_at_gmt: string
  played_at_gmt_ts: number
  played_at_local: string
  played_at_local_ts: number
  artist_is_local: boolean
  lastfm_urls?: {
    large_image?: string | null
    med_image?: string | null
    sm_image?: string | null
  }
}

interface ChirpPlaylistResponse {
  now_playing: ChirpSong
  recently_played: ChirpSong[]
}

export interface PlaylistTrack {
  albumArt?: string
  artistName: string
  trackName: string
  albumName?: string
  labelName?: string
  isLocal?: boolean
  timeAgo?: string
  playedAtGmt?: string
}

interface UseCurrentPlaylistReturn {
  tracks: PlaylistTrack[]
  isLoading: boolean
  error: Error | null
}

export function useCurrentPlaylist(): UseCurrentPlaylistReturn {
  const [tracks, setTracks] = useState<PlaylistTrack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const lastFetchRef = useRef<number>(0)

  // Get CMS fallback images
  const { data: fallbackImages, loading: fallbackLoading } = usePlayerFallbackImages()

  const fetchPlaylist = useCallback(async () => {
    // Wait for fallback images to load before fetching
    if (fallbackLoading) {
      return
    }

    // Debounce: prevent multiple rapid fetches within 2 seconds
    const now = Date.now()
    if (now - lastFetchRef.current < 2000) {
      console.log('[useCurrentPlaylist] Debouncing fetch - too soon after last fetch')
      return
    }
    lastFetchRef.current = now

    try {
      setIsLoading(true)
      setError(null)

      // Always use relative path - Vite proxy in dev, nginx proxy in production
      const apiUrl = '/api/current_playlist'

      let responseData: ChirpPlaylistResponse

      const isNative = Capacitor.getPlatform() !== 'web'

      if (isNative) {
        // Native: Use CapacitorHttp (bypasses CORS)
        const response = await CapacitorHttp.get({
          url: apiUrl,
          headers: { 'Content-Type': 'application/json' },
        })

        if (response.status !== 200 || !response.data) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
        responseData = response.data
      } else {
        // Web: Use fetch (works with Vite proxy)
        const response = await fetch(apiUrl, {
          headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
        responseData = await response.json()
      }

      // Combine now_playing and recently_played into a single array
      const allSongs: ChirpSong[] = [responseData.now_playing, ...responseData.recently_played]

      // Get fallback image URLs from CMS (pick a random one for tracks without Last.fm art)
      const fallbackUrls = fallbackImages
        .filter((img) => img.url)
        .map((img) => img.sizes?.player?.url || img.url || '')
        .filter((url) => url)

      console.log('[useCurrentPlaylist] Fallback URLs available:', fallbackUrls.length)

      // Transform to PlaylistTrack format (synchronous, no API calls)
      const transformedTracks: PlaylistTrack[] = allSongs.map((song) => {
        // Get best available album art from Last.fm
        let albumArt: string | undefined
        if (song.lastfm_urls) {
          const bestImage =
            song.lastfm_urls.large_image || song.lastfm_urls.med_image || song.lastfm_urls.sm_image

          if (bestImage) {
            albumArt = upgradeImageQuality(bestImage, 'medium')
          }
        }

        // If no Last.fm art, use deterministic CMS fallback image
        if (!albumArt && fallbackUrls.length > 0) {
          const fallback = getRandomFallback(fallbackUrls, -1, song.artist, song.release || '')
          albumArt = fallback.url
          console.log(
            '[useCurrentPlaylist] Using deterministic fallback for:',
            song.artist,
            '-',
            song.track,
            'URL:',
            albumArt,
            'index:',
            fallback.index
          )
        } else if (!albumArt) {
          console.log('[useCurrentPlaylist] NO ALBUM ART for:', song.artist, '-', song.track)
        }

        // Calculate time ago from played_at_local (Chicago time)
        const playedAt = new Date(song.played_at_local)
        const timeAgo = playedAt.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/Chicago',
        })

        return {
          albumArt,
          artistName: song.artist,
          trackName: song.track,
          albumName: song.release,
          labelName: song.label,
          isLocal: song.artist_is_local,
          timeAgo,
          playedAtGmt: song.played_at_gmt,
        }
      })

      console.log(
        '[useCurrentPlaylist] Fetched and transformed',
        transformedTracks.length,
        'tracks'
      )
      setTracks(transformedTracks)
    } catch (err) {
      console.error('[useCurrentPlaylist] Error fetching playlist:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [fallbackImages, fallbackLoading])

  // Initial fetch and polling interval
  useEffect(() => {
    fetchPlaylist()

    // Poll every 30 seconds to keep the playlist fresh
    const interval = setInterval(fetchPlaylist, 30000)

    return () => clearInterval(interval)
  }, [fetchPlaylist])

  // Listen for song changes from streaming player for instant sync
  useEffect(() => {
    const unsubscribe = on('songChanged', (payload) => {
      console.log(
        '[useCurrentPlaylist] Song changed event received:',
        payload.artist,
        '-',
        payload.track
      )
      console.log('[useCurrentPlaylist] Triggering immediate playlist refresh for sync')
      fetchPlaylist()
    })

    return unsubscribe
  }, [fetchPlaylist])

  return { tracks, isLoading, error }
}
