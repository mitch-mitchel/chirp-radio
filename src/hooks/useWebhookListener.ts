/**
 * Hook to listen for CMS webhook events via Server-Sent Events (SSE)
 * Triggers CMS data refresh when content changes
 */
import { useEffect, useRef } from 'react'
import { emit } from '../utils/eventBus'
import { clearCache } from '../utils/cmsCache'

interface WebhookEvent {
  collection: string
  operation: 'create' | 'update' | 'delete'
  timestamp: string
  id?: string | number
  type?: string // For connection events
}

// Map CMS collection names to cache keys
const COLLECTION_TO_CACHE_KEY: Record<string, string> = {
  announcements: 'announcements',
  articles: 'articles',
  events: 'events',
  podcasts: 'podcasts',
  listeners: 'members',
  volunteerCalendar: 'volunteer-calendar',
  shopItems: 'shop-items',
  pages: 'pages',
  'site-settings': 'site-settings',
  siteSettings: 'site-settings',
  weeklyCharts: 'weekly-charts',
  'mobile-page-content': 'mobile-page-content',
  mobilePageContent: 'mobile-page-content',
  'mobile-app-settings': 'mobile-app-settings',
  mobileAppSettings: 'mobile-app-settings',
  'volunteer-form-settings': 'volunteer-form-settings',
  volunteerFormSettings: 'volunteer-form-settings',
  'player-fallback-images': 'player-fallback-images',
  playerFallbackImages: 'player-fallback-images',
  showSchedules: 'show-schedules',
  'show-schedules': 'show-schedules',
}

export function useWebhookListener() {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Enable when CMS API is enabled (both dev and production)
    const USE_CMS_API = import.meta.env.VITE_USE_CMS_API === 'true'

    if (!USE_CMS_API) {
      console.log('[Webhook Listener] Disabled (CMS API not enabled)')
      return
    }

    function connect() {
      try {
        // Connect to SSE endpoint
        const eventSource = new EventSource('/api/webhook/events')
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
          console.log('[Webhook Listener] Connected to webhook events')
        }

        eventSource.onmessage = (event) => {
          try {
            const data: WebhookEvent = JSON.parse(event.data)

            // Skip connection events
            if (data.type === 'connected') {
              console.log('[Webhook Listener] Connection confirmed')
              return
            }

            console.log('[Webhook Listener] Received update:', data.collection, data.operation)

            // Clear cache for the specific collection
            const cacheKey = COLLECTION_TO_CACHE_KEY[data.collection]
            if (cacheKey) {
              console.log('[Webhook Listener] Clearing cache for:', cacheKey)
              clearCache(cacheKey)
            } else {
              console.warn(
                '[Webhook Listener] No cache key mapping for collection:',
                data.collection
              )
            }

            // Emit event to trigger CMS context refresh
            emit('cms-data-updated')
          } catch (error) {
            console.error('[Webhook Listener] Error parsing event:', error)
          }
        }

        eventSource.onerror = (error) => {
          console.error('[Webhook Listener] SSE error:', error)
          eventSource.close()
          eventSourceRef.current = null

          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[Webhook Listener] Attempting to reconnect...')
            connect()
          }, 5000)
        }
      } catch (error) {
        console.error('[Webhook Listener] Error connecting to SSE:', error)
      }
    }

    // Initial connection
    connect()

    // Cleanup
    return () => {
      if (eventSourceRef.current) {
        console.log('[Webhook Listener] Disconnecting from webhook events')
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])
}
