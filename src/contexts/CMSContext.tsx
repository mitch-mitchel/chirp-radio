import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type {
  CMSData,
  CMSLoadingState,
  CMSErrorState,
  Announcement,
  Article,
  Event,
  Podcast,
  Member,
  VolunteerCalendarEvent,
  ShopItem,
  ShowSchedule,
  Page,
  SiteSettings,
  WeeklyChart,
  MobilePageContent,
  MobileAppSettings,
  PlayerFallbackImage,
  Redirect,
} from '../types/cms'
import type { VolunteerFormSettings } from '../types/volunteerForm'
import { fetchFromCMS, transformMediaUrl } from '../utils/api'
import { on } from '../utils/eventBus'
import { useWebhookListener } from '../hooks/useWebhookListener'
import { getCached, setCached, isCacheStale } from '../utils/cmsCache'

// Import mock data
import announcementsData from '../data/announcements.json'
import articlesData from '../data/articles.json'
import eventsData from '../data/events.json'
import podcastsData from '../data/podcasts.json'
import shopItemsData from '../data/shopItems.json'

// Feature flag to toggle between mock data and CMS API
const USE_CMS_API = import.meta.env.VITE_USE_CMS_API === 'true'

// Convert Lexical JSON to HTML
function lexicalToHtml(lexicalData: unknown): string | null {
  if (!lexicalData || typeof lexicalData !== 'object' || !('root' in lexicalData)) {
    return null
  }

  const processNode = (node: Record<string, unknown>): string => {
    if (!node) return ''

    // Text node
    if (node.type === 'text') {
      let text = (node.text as string) || ''
      const format = node.format as number
      if (format & 1) text = `<strong>${text}</strong>` // bold
      if (format & 2) text = `<em>${text}</em>` // italic
      if (format & 8) text = `<u>${text}</u>` // underline
      return text
    }

    // Link node
    if (node.type === 'link') {
      const children = (node.children as Record<string, unknown>[])?.map(processNode).join('') || ''
      const fields = node.fields as Record<string, unknown>
      const url = (fields?.url as string) || '#'
      const target = fields?.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `<a href="${url}"${target}>${children}</a>`
    }

    // Paragraph node
    if (node.type === 'paragraph') {
      const children = (node.children as Record<string, unknown>[])?.map(processNode).join('') || ''
      return `<p>${children}</p>`
    }

    // Heading node
    if (node.type === 'heading') {
      const children = (node.children as Record<string, unknown>[])?.map(processNode).join('') || ''
      const tag = (node.tag as string) || 'h2'
      return `<${tag}>${children}</${tag}>`
    }

    // List node
    if (node.type === 'list') {
      const children = (node.children as Record<string, unknown>[])?.map(processNode).join('') || ''
      const tag = node.listType === 'number' ? 'ol' : 'ul'
      return `<${tag}>${children}</${tag}>`
    }

    // List item node
    if (node.type === 'listitem') {
      const children = (node.children as Record<string, unknown>[])?.map(processNode).join('') || ''
      return `<li>${children}</li>`
    }

    // Root node or other container nodes
    if ('children' in node) {
      return (node.children as Record<string, unknown>[]).map(processNode).join('')
    }

    return ''
  }

  return processNode(lexicalData.root as Record<string, unknown>)
}

interface CMSContextValue {
  data: CMSData
  loading: CMSLoadingState
  error: CMSErrorState
  refresh: (collection?: keyof CMSData) => Promise<void>
  isInitialized: boolean
}

const CMSContext = createContext<CMSContextValue | undefined>(undefined)

interface CMSProviderProps {
  children: ReactNode
}

export function CMSProvider({ children }: CMSProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false)

  // Connect to webhook SSE stream for live updates
  useWebhookListener()

  // Data state
  const [data, setData] = useState<CMSData>({
    announcements: USE_CMS_API
      ? []
      : (announcementsData.announcements as unknown as Announcement[]),
    articles: USE_CMS_API ? [] : (articlesData.articles as unknown as Article[]),
    events: USE_CMS_API ? [] : (eventsData.events as unknown as Event[]),
    podcasts: USE_CMS_API ? [] : (podcastsData.podcasts as unknown as Podcast[]),
    djs: [],
    members: [], // Always load from CMS - no mock data fallback
    volunteerCalendar: [],
    shopItems: USE_CMS_API ? [] : (shopItemsData.shopItems as unknown as ShopItem[]),
    pages: [],
    siteSettings: null,
    weeklyCharts: [],
    mobilePageContent: [],
    mobileAppSettings: null,
    volunteerFormSettings: null,
    playerFallbackImages: [],
    showSchedules: [],
    redirects: [],
  })

  // Loading state
  const [loading, setLoading] = useState<CMSLoadingState>({
    announcements: USE_CMS_API,
    articles: USE_CMS_API,
    events: USE_CMS_API,
    podcasts: USE_CMS_API,
    djs: USE_CMS_API,
    members: USE_CMS_API,
    volunteerCalendar: USE_CMS_API,
    shopItems: USE_CMS_API,
    pages: USE_CMS_API,
    siteSettings: USE_CMS_API,
    weeklyCharts: USE_CMS_API,
    mobilePageContent: USE_CMS_API,
    mobileAppSettings: USE_CMS_API,
    volunteerFormSettings: USE_CMS_API,
    playerFallbackImages: USE_CMS_API,
    showSchedules: USE_CMS_API,
    redirects: USE_CMS_API,
  })

  // Error state
  const [error, setError] = useState<CMSErrorState>({
    announcements: null,
    articles: null,
    events: null,
    podcasts: null,
    djs: null,
    members: null,
    volunteerCalendar: null,
    shopItems: null,
    pages: null,
    siteSettings: null,
    weeklyCharts: null,
    mobilePageContent: null,
    mobileAppSettings: null,
    volunteerFormSettings: null,
    playerFallbackImages: null,
    showSchedules: null,
    redirects: null,
  })

  // Fetch announcements
  const fetchAnnouncements = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'announcements'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<Announcement[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading announcements from cache')
      setData((prev) => ({ ...prev, announcements: cached }))
      setLoading((prev) => ({ ...prev, announcements: false }))
    } else {
      setLoading((prev) => ({ ...prev, announcements: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Announcements cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, announcements: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('announcements')

      const mappedDocs = docs.map((announcement) => ({
        ...announcement,
        bodyText:
          typeof announcement.bodyText === 'string'
            ? announcement.bodyText
            : lexicalToHtml(announcement.bodyText),
      })) as Announcement[]

      // Update state and cache
      setData((prev) => ({ ...prev, announcements: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch announcements:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached announcements due to API error')
      } else {
        setError((prev) => ({ ...prev, announcements: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, announcements: false }))
    }
  }, [])

  // Fetch articles
  const fetchArticles = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'articles'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<Article[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading articles from cache')
      setData((prev) => ({ ...prev, articles: cached }))
      setLoading((prev) => ({ ...prev, articles: false }))
    } else {
      setLoading((prev) => ({ ...prev, articles: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Articles cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, articles: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('articles', { sort: '-createdAt' })

      const mappedDocs = docs.map((article) => ({
        ...article,
        featuredImage: article.featuredImage || article.featuredImageUrl,
        tags:
          (article.tags as Array<Record<string, unknown> | string>)?.map((t) =>
            typeof t === 'string' ? t : (t.tag as string)
          ) || [],
        content:
          typeof article.content === 'string' ? article.content : lexicalToHtml(article.content),
      })) as Article[]

      // Update state and cache
      setData((prev) => ({ ...prev, articles: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch articles:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached articles due to API error')
      } else {
        setError((prev) => ({ ...prev, articles: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, articles: false }))
    }
  }, [])

  // Fetch events
  const fetchEvents = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'events'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<Event[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading events from cache')
      setData((prev) => ({ ...prev, events: cached }))
      setLoading((prev) => ({ ...prev, events: false }))
    } else {
      setLoading((prev) => ({ ...prev, events: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Events cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, events: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('events', { sort: '-date' })

      const mappedDocs = docs.map((event) => ({
        ...event,
        featuredImage: event.featuredImage || event.featuredImageUrl,
        content: typeof event.content === 'string' ? event.content : lexicalToHtml(event.content),
      })) as Event[]

      // Update state and cache
      setData((prev) => ({ ...prev, events: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch events:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached events due to API error')
      } else {
        setError((prev) => ({ ...prev, events: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, events: false }))
    }
  }, [])

  // Fetch podcasts
  const fetchPodcasts = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'podcasts'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<Podcast[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading podcasts from cache')
      setData((prev) => ({ ...prev, podcasts: cached }))
      setLoading((prev) => ({ ...prev, podcasts: false }))
    } else {
      setLoading((prev) => ({ ...prev, podcasts: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Podcasts cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, podcasts: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('podcasts', {
        sort: '-publishDate',
        depth: '1',
        limit: '100',
      })

      const mappedDocs = docs.map((podcast) => ({
        ...podcast,
        coverArt: podcast.coverArt || podcast.coverArtUrl,
        tags:
          (podcast.tags as Array<Record<string, unknown> | string>)?.map((t) =>
            typeof t === 'string' ? t : (t.tag as string)
          ) || [],
        content:
          typeof podcast.content === 'string' ? podcast.content : lexicalToHtml(podcast.content),
      })) as Podcast[]

      // Update state and cache
      setData((prev) => ({ ...prev, podcasts: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch podcasts:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached podcasts due to API error')
      } else {
        setError((prev) => ({ ...prev, podcasts: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, podcasts: false }))
    }
  }, [])

  // Fetch members (from 'listeners' collection)
  const fetchMembers = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'members'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<Member[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading members from cache')
      setData((prev) => ({ ...prev, members: cached }))
      setLoading((prev) => ({ ...prev, members: false }))
    } else {
      setLoading((prev) => ({ ...prev, members: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Members cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, members: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('listeners', {
        sort: 'djName',
        limit: '500',
        depth: '1', // Populate media relationships (profileImage)
      })

      const mappedDocs = docs.map((member) => ({
        ...member,
        id: member.id?.toString(),
        roles: Array.isArray(member.roles) ? (member.roles as string[]) : [],
        djBio: typeof member.djBio === 'string' ? member.djBio : lexicalToHtml(member.djBio),
        volunteerOrgs: Array.isArray(member.volunteerOrgs)
          ? (member.volunteerOrgs as Array<Record<string, unknown> | string>).map((org) =>
              typeof org === 'string' ? org : (org.org as string)
            )
          : [],
        specialSkills: Array.isArray(member.specialSkills)
          ? (member.specialSkills as Array<Record<string, unknown> | string>).map((skill) =>
              typeof skill === 'string' ? skill : (skill.skill as string)
            )
          : [],
        interests: Array.isArray(member.interests)
          ? (member.interests as Array<Record<string, unknown> | string>).map((interest) =>
              typeof interest === 'string' ? interest : (interest.interest as string)
            )
          : [],
        hearAboutChirp: Array.isArray(member.hearAboutChirp)
          ? (member.hearAboutChirp as Array<Record<string, unknown> | string>).map((source) =>
              typeof source === 'string' ? source : (source.source as string)
            )
          : [],
        djAvailability: Array.isArray(member.djAvailability)
          ? (member.djAvailability as Array<Record<string, unknown> | string>).map((time) =>
              typeof time === 'string' ? time : (time.time as string)
            )
          : [],
        substituteAvailability: Array.isArray(member.substituteAvailability)
          ? (member.substituteAvailability as Array<Record<string, unknown> | string>).map(
              (time) => (typeof time === 'string' ? time : (time.time as string))
            )
          : [],
      })) as Member[]

      // Update state and cache
      setData((prev) => ({ ...prev, members: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch members:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached members due to API error')
      } else {
        setError((prev) => ({ ...prev, members: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, members: false }))
    }
  }, [])

  // Fetch volunteer calendar
  const fetchVolunteerCalendar = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'volunteer-calendar'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<VolunteerCalendarEvent[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading volunteer calendar from cache')
      setData((prev) => ({ ...prev, volunteerCalendar: cached }))
      setLoading((prev) => ({ ...prev, volunteerCalendar: false }))
    } else {
      setLoading((prev) => ({ ...prev, volunteerCalendar: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Volunteer calendar cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, volunteerCalendar: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('volunteerCalendar', {
        sort: 'startDate',
      })

      const mappedDocs = docs.map((event) => ({
        ...event,
        startDate: event.startDate ? String(event.startDate).split('T')[0] : event.startDate,
        endDate: event.endDate ? String(event.endDate).split('T')[0] : event.endDate,
        eventDetails:
          (event.eventDetails as Array<Record<string, unknown> | string>)?.map((item) =>
            typeof item === 'string' ? item : (item.detail as string)
          ) || [],
      })) as VolunteerCalendarEvent[]

      // Update state and cache
      setData((prev) => ({ ...prev, volunteerCalendar: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch volunteer calendar:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached volunteer calendar due to API error')
      } else {
        setError((prev) => ({ ...prev, volunteerCalendar: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, volunteerCalendar: false }))
    }
  }, [])

  // Fetch shop items
  const fetchShopItems = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'shop-items'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<ShopItem[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading shop items from cache')
      setData((prev) => ({ ...prev, shopItems: cached }))
      setLoading((prev) => ({ ...prev, shopItems: false }))
    } else {
      setLoading((prev) => ({ ...prev, shopItems: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Shop items cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, shopItems: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('shopItems', {
        limit: 1000,
      })

      const mappedDocs = docs.map((item) => {
        const images = (item.images as Array<Record<string, unknown>>) || []
        const imageUrls = images
          .map((img) => (img.image as Record<string, unknown>)?.url as string)
          .filter(Boolean)

        return {
          ...item,
          image: imageUrls.length > 0 ? imageUrls[0] : item.imageUrl,
          additionalImageUrls:
            imageUrls.length > 1 ? imageUrls.slice(1).map((url) => ({ url })) : [],
          sizes:
            (item.sizes as Array<Record<string, unknown> | string>)?.map((s) =>
              typeof s === 'string' ? s : (s.size as string)
            ) || [],
          itemType:
            item.category === 'apparel'
              ? 'Apparel'
              : item.category === 'poster'
                ? 'Poster'
                : item.category === 'accessories'
                  ? 'Accessories'
                  : item.category === 'merchandise'
                    ? 'Merchandise'
                    : item.category === 'music'
                      ? 'Music'
                      : item.itemType || 'Other',
        }
      }) as unknown as ShopItem[]

      // Sort by itemType (category), then by name
      const sortedDocs = mappedDocs.sort((a, b) => {
        // First sort by itemType
        if (a.itemType !== b.itemType) {
          return (a.itemType || '').localeCompare(b.itemType || '')
        }
        // Then by name
        return (a.name || '').localeCompare(b.name || '')
      })

      // Update state and cache
      setData((prev) => ({ ...prev, shopItems: sortedDocs }))
      setCached(cacheKey, sortedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch shop items:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached shop items due to API error')
      } else {
        setError((prev) => ({ ...prev, shopItems: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, shopItems: false }))
    }
  }, [])

  // Fetch pages
  const fetchPages = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'pages'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<Page[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading pages from cache')
      setData((prev) => ({ ...prev, pages: cached }))
      setLoading((prev) => ({ ...prev, pages: false }))
    } else {
      setLoading((prev) => ({ ...prev, pages: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Pages cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, pages: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('pages', {
        depth: '2',
        limit: '100',
      })

      const processedDocs = docs.map((page) => ({
        ...page,
        layout: (page.layout as Array<Record<string, unknown>>)?.map((block) => {
          if (block.blockType === 'contentCard' && block.content) {
            const htmlContent =
              typeof block.content === 'string' ? block.content : lexicalToHtml(block.content)
            return { ...block, content: htmlContent }
          }
          return block
        }),
      })) as Page[]

      // Update state and cache
      setData((prev) => ({ ...prev, pages: processedDocs }))
      setCached(cacheKey, processedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch pages:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached pages due to API error')
      } else {
        setError((prev) => ({ ...prev, pages: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, pages: false }))
    }
  }, [])

  // Fetch site settings
  const fetchSiteSettings = useCallback(async () => {
    const cacheKey = 'site-settings'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<SiteSettings>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading site settings from cache')
      setData((prev) => ({ ...prev, siteSettings: cached }))
      setLoading((prev) => ({ ...prev, siteSettings: false }))
    } else {
      setLoading((prev) => ({ ...prev, siteSettings: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    if (!isCacheStale(cacheKey) && cached) {
      console.log('[CMSContext] Site settings cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, siteSettings: null }))

    try {
      const apiUrl = import.meta.env.VITE_CMS_API_URL || '/api'
      const response = await fetch(`${apiUrl}/globals/siteSettings?depth=2`)

      if (!response.ok) {
        throw new Error('Failed to fetch site settings')
      }

      const settings = await response.json()

      // Update state and cache
      setData((prev) => ({ ...prev, siteSettings: settings as SiteSettings }))
      setCached(cacheKey, settings as SiteSettings)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch site settings:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached site settings due to API error')
      } else {
        setError((prev) => ({ ...prev, siteSettings: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, siteSettings: false }))
    }
  }, [])

  // Fetch weekly charts
  const fetchWeeklyCharts = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'weekly-charts'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<WeeklyChart[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading weekly charts from cache')
      setData((prev) => ({ ...prev, weeklyCharts: cached }))
      setLoading((prev) => ({ ...prev, weeklyCharts: false }))
    } else {
      setLoading((prev) => ({ ...prev, weeklyCharts: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Weekly charts cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, weeklyCharts: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('weeklyCharts', {
        sort: '-weekOf',
        limit: '100',
      })

      const mappedDocs = docs.map((chart) => ({
        ...chart,
        id: chart.id?.toString(),
      })) as WeeklyChart[]

      // Update state and cache
      setData((prev) => ({ ...prev, weeklyCharts: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch weekly charts:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached weekly charts due to API error')
      } else {
        setError((prev) => ({ ...prev, weeklyCharts: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, weeklyCharts: false }))
    }
  }, [])

  // Fetch mobile page content
  const fetchMobilePageContent = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'mobile-page-content'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<MobilePageContent[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading mobile page content from cache')
      setData((prev) => ({ ...prev, mobilePageContent: cached }))
      setLoading((prev) => ({ ...prev, mobilePageContent: false }))
    } else {
      setLoading((prev) => ({ ...prev, mobilePageContent: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Mobile page content cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, mobilePageContent: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('mobilePageContent', {
        limit: '100',
        depth: '1',
      })

      const mappedDocs = docs.map((page) => {
        // Transform the populated announcement if it exists
        let transformedAnnouncement = page.announcement
        if (typeof page.announcement === 'object' && page.announcement !== null) {
          const ann = page.announcement as Record<string, unknown>
          transformedAnnouncement = {
            ...ann,
            bodyText: typeof ann.bodyText === 'string' ? ann.bodyText : lexicalToHtml(ann.bodyText),
          }
        }

        return {
          ...page,
          id: page.id?.toString(),
          pageIdentifier: page.pageIdentifier as
            | 'make-request'
            | 'now-playing'
            | 'recently-played'
            | 'my-collection'
            | 'account-settings'
            | 'android-auto',
          announcement: transformedAnnouncement,
          introContent:
            typeof page.introContent === 'string'
              ? page.introContent
              : lexicalToHtml(page.introContent),
          customNotLoggedInMessage:
            typeof page.customNotLoggedInMessage === 'string'
              ? page.customNotLoggedInMessage
              : lexicalToHtml(page.customNotLoggedInMessage),
        } as MobilePageContent
      })

      // Update state and cache
      setData((prev) => ({ ...prev, mobilePageContent: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch mobile page content:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached mobile page content due to API error')
      } else {
        setError((prev) => ({ ...prev, mobilePageContent: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, mobilePageContent: false }))
    }
  }, [])

  // Fetch mobile app settings
  const fetchMobileAppSettings = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'mobile-app-settings'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<MobileAppSettings>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading mobile app settings from cache')
      setData((prev) => ({ ...prev, mobileAppSettings: cached }))
      setLoading((prev) => ({ ...prev, mobileAppSettings: false }))
    } else {
      setLoading((prev) => ({ ...prev, mobileAppSettings: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    if (!isCacheStale(cacheKey) && cached) {
      console.log('[CMSContext] Mobile app settings cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, mobileAppSettings: null }))

    try {
      const apiUrl = import.meta.env.VITE_CMS_API_URL || '/api'
      const response = await fetch(`${apiUrl}/globals/mobileAppSettings`)

      if (!response.ok) {
        throw new Error('Failed to fetch mobile app settings')
      }

      const settings = await response.json()

      // Convert Lexical fields to HTML
      const processedSettings = {
        ...settings,
        notLoggedInMessage: settings.notLoggedInMessage
          ? {
              ...settings.notLoggedInMessage,
              message:
                typeof settings.notLoggedInMessage.message === 'string'
                  ? settings.notLoggedInMessage.message
                  : lexicalToHtml(settings.notLoggedInMessage.message),
            }
          : undefined,
        accountBenefitsContent:
          typeof settings.accountBenefitsContent === 'string'
            ? settings.accountBenefitsContent
            : lexicalToHtml(settings.accountBenefitsContent),
      }

      // Update state and cache
      setData((prev) => ({ ...prev, mobileAppSettings: processedSettings as MobileAppSettings }))
      setCached(cacheKey, processedSettings as MobileAppSettings)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch mobile app settings:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached mobile app settings due to API error')
      } else {
        setError((prev) => ({ ...prev, mobileAppSettings: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, mobileAppSettings: false }))
    }
  }, [])

  // Fetch volunteer form settings
  const fetchVolunteerFormSettings = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'volunteer-form-settings'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<VolunteerFormSettings>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading volunteer form settings from cache')
      setData((prev) => ({ ...prev, volunteerFormSettings: cached }))
      setLoading((prev) => ({ ...prev, volunteerFormSettings: false }))
    } else {
      setLoading((prev) => ({ ...prev, volunteerFormSettings: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    if (!isCacheStale(cacheKey) && cached) {
      console.log('[CMSContext] Volunteer form settings cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, volunteerFormSettings: null }))

    try {
      const apiUrl = import.meta.env.VITE_CMS_API_URL || '/api'
      const response = await fetch(`${apiUrl}/globals/volunteerFormSettings`)

      if (!response.ok) {
        throw new Error(`Failed to fetch volunteer form settings: ${response.statusText}`)
      }

      const settings = await response.json()

      // Update state and cache
      setData((prev) => ({ ...prev, volunteerFormSettings: settings as VolunteerFormSettings }))
      setCached(cacheKey, settings as VolunteerFormSettings)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch volunteer form settings:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached volunteer form settings due to API error')
      } else {
        setError((prev) => ({ ...prev, volunteerFormSettings: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, volunteerFormSettings: false }))
    }
  }, [])

  // Fetch player fallback images
  const fetchPlayerFallbackImages = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'player-fallback-images'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<PlayerFallbackImage[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading player fallback images from cache')
      setData((prev) => ({ ...prev, playerFallbackImages: cached }))
      setLoading((prev) => ({ ...prev, playerFallbackImages: false }))
    } else {
      setLoading((prev) => ({ ...prev, playerFallbackImages: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Player fallback images cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, playerFallbackImages: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('player-fallback-images', {
        where: JSON.stringify({ isActive: { equals: true } }),
      })

      const mappedDocs = docs.map((image) => ({
        ...image,
        // Transform relative URLs to absolute URLs with CMS base
        url: transformMediaUrl((image.url as string) || ''),
      })) as PlayerFallbackImage[]

      // Update state and cache
      setData((prev) => ({ ...prev, playerFallbackImages: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch player fallback images:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached player fallback images due to API error')
      } else {
        setError((prev) => ({ ...prev, playerFallbackImages: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, playerFallbackImages: false }))
    }
  }, [])

  // Fetch show schedules
  const fetchShowSchedules = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'show-schedules'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<ShowSchedule[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading show schedules from cache')
      setData((prev) => ({ ...prev, showSchedules: cached }))
      setLoading((prev) => ({ ...prev, showSchedules: false }))
    } else {
      setLoading((prev) => ({ ...prev, showSchedules: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    // Always fetch if cache is empty, even if not stale (handles case where data was added to CMS after cache was populated)
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Show schedules cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API (in background if we have cached data)
    setError((prev) => ({ ...prev, showSchedules: null }))

    try {
      const docs = await fetchFromCMS<Record<string, unknown>>('showSchedules', {
        depth: '1', // Populate DJ relationship
        sort: 'displayOrder',
        limit: '500',
      })

      const mappedDocs = docs.map((schedule) => ({
        ...schedule,
        id: schedule.id?.toString(),
      })) as ShowSchedule[]

      // Update state and cache
      setData((prev) => ({ ...prev, showSchedules: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch show schedules:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached show schedules due to API error')
      } else {
        setError((prev) => ({ ...prev, showSchedules: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, showSchedules: false }))
    }
  }, [])

  // Fetch redirects
  const fetchRedirects = useCallback(async () => {
    if (!USE_CMS_API) return

    const cacheKey = 'redirects'

    // Step 1: Check cache and load immediately if available
    const cached = getCached<Redirect[]>(cacheKey)
    if (cached) {
      console.log('[CMSContext] Loading redirects from cache')
      setData((prev) => ({ ...prev, redirects: cached }))
      setLoading((prev) => ({ ...prev, redirects: false }))
    } else {
      setLoading((prev) => ({ ...prev, redirects: true }))
    }

    // Step 2: Check if we need to fetch fresh data
    if (!isCacheStale(cacheKey) && cached && cached.length > 0) {
      console.log('[CMSContext] Redirects cache is fresh, skipping API call')
      return
    }

    // Step 3: Fetch from API
    setError((prev) => ({ ...prev, redirects: null }))

    try {
      const docs = await fetchFromCMS<Redirect>('redirects')

      const mappedDocs = docs.map((redirect) => ({
        ...redirect,
        id: redirect.id?.toString(),
      })) as Redirect[]

      // Update state and cache
      setData((prev) => ({ ...prev, redirects: mappedDocs }))
      setCached(cacheKey, mappedDocs)
    } catch (err) {
      console.error('[CMSContext] Failed to fetch redirects:', err)

      // If we have cached data, keep using it
      if (cached) {
        console.log('[CMSContext] Using cached redirects due to API error')
      } else {
        setError((prev) => ({ ...prev, redirects: err as Error }))
      }
    } finally {
      setLoading((prev) => ({ ...prev, redirects: false }))
    }
  }, [])

  // Refresh data - optionally refresh a specific collection
  const refresh = useCallback(
    async (collection?: keyof CMSData) => {
      // Map collection names to their fetch functions
      const collectionFetchers: Record<keyof CMSData, () => Promise<void>> = {
        announcements: fetchAnnouncements,
        articles: fetchArticles,
        events: fetchEvents,
        podcasts: fetchPodcasts,
        djs: async () => {}, // DJs are fetched from members
        members: fetchMembers,
        volunteerCalendar: fetchVolunteerCalendar,
        shopItems: fetchShopItems,
        pages: fetchPages,
        siteSettings: fetchSiteSettings,
        weeklyCharts: fetchWeeklyCharts,
        mobilePageContent: fetchMobilePageContent,
        mobileAppSettings: fetchMobileAppSettings,
        volunteerFormSettings: fetchVolunteerFormSettings,
        playerFallbackImages: fetchPlayerFallbackImages,
        showSchedules: fetchShowSchedules,
        redirects: fetchRedirects,
      }

      if (collection) {
        // Refresh specific collection
        console.log(`[CMSContext] Refreshing collection: ${collection}`)
        const fetcher = collectionFetchers[collection]
        if (fetcher) {
          await fetcher()
        }
      } else {
        // Refresh all data
        console.log('[CMSContext] Refreshing all data')
        await Promise.all([
          fetchAnnouncements(),
          fetchArticles(),
          fetchEvents(),
          fetchPodcasts(),
          fetchMembers(),
          fetchVolunteerCalendar(),
          fetchShopItems(),
          fetchPages(),
          fetchSiteSettings(),
          fetchWeeklyCharts(),
          fetchMobilePageContent(),
          fetchMobileAppSettings(),
          fetchVolunteerFormSettings(),
          fetchPlayerFallbackImages(),
          fetchShowSchedules(),
          fetchRedirects(),
        ])
      }
    },
    [
      fetchAnnouncements,
      fetchArticles,
      fetchEvents,
      fetchPodcasts,
      fetchMembers,
      fetchVolunteerCalendar,
      fetchShopItems,
      fetchPages,
      fetchSiteSettings,
      fetchWeeklyCharts,
      fetchMobilePageContent,
      fetchMobileAppSettings,
      fetchVolunteerFormSettings,
      fetchPlayerFallbackImages,
      fetchShowSchedules,
      fetchRedirects,
    ]
  )

  // Initial fetch on mount
  useEffect(() => {
    const initializeData = () => {
      console.log('[CMSContext] Initializing CMS data...', { USE_CMS_API })
      // Don't await - let it load in background while app renders
      refresh()
      setIsInitialized(true)
      console.log('[CMSContext] CMS data initialized (background loading)')
    }

    initializeData()
  }, [refresh])

  // Listen for CMS update events using typed event bus
  useEffect(() => {
    const unsubscribe = on('cms-data-updated', () => {
      console.log('[CMSContext] CMS update event received, refreshing data...')
      refresh()
    })

    return unsubscribe
  }, [refresh])

  const value: CMSContextValue = {
    data,
    loading,
    error,
    refresh,
    isInitialized,
  }

  return <CMSContext.Provider value={value}>{children}</CMSContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCMS(): CMSContextValue {
  const context = useContext(CMSContext)
  if (context === undefined) {
    throw new Error('useCMS must be used within a CMSProvider')
  }
  return context
}
