// src/pages/PlaylistPage.tsx
import React, { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import CrPageHeader from '../stories/CrPageHeader'
import CrBreadcrumb from '../stories/CrBreadcrumb'
import CrPlaylistTable from '../stories/CrPlaylistTable'
import CrAnnouncement from '../stories/CrAnnouncement'
import CrCard from '../stories/CrCard'
import CrPagination from '../stories/CrPagination'
import { useArticles } from '../hooks/useData'
import { useTracksPlayed } from '../hooks/useTracksPlayed'
import announcementsData from '../data/announcements.json'
import type { Article, Announcement } from '../types/cms'
import { getArticleImageUrl, getArticleCategoryName, getArticleTags } from '../utils/typeHelpers'

const HOURS_PER_PAGE = 4

const PlaylistPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: tracks } = useTracksPlayed({ limit: 200, page: 1 })
  const { data: articles } = useArticles()

  // Get current page from URL, default to 0
  const currentPage = parseInt(searchParams.get('page') || '0', 10)

  // Create page title with page number
  const pageTitle = currentPage > 0 ? `Playlist - Page ${currentPage + 1}` : 'Playlist'

  // Select random announcement on mount
  const randomAnnouncement = useMemo(() => {
    const activeAnnouncements = announcementsData.announcements.filter(
      (a: Announcement) => 'isActive' in a && (a as Record<string, unknown>).isActive
    )
    if (activeAnnouncements.length === 0) return announcementsData.announcements[0] as Announcement
    return activeAnnouncements[
      Math.floor(Math.random() * activeAnnouncements.length)
    ] as Announcement
  }, [])

  // Format tracks with hour data for grouping
  const formattedTracks = useMemo(() => {
    if (!tracks || tracks.length === 0) return []

    return tracks.map((track) => {
      // Generate hourKey from playedAt timestamp
      const playedDate = new Date(track.playedAt)
      const hour = playedDate.getHours()
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
      const period = hour < 12 ? 'am' : 'pm'
      const hourKey = `${hour12}${period}`

      // Parse the hourKey to determine start/end times
      const hourMatch = hourKey.match(/(\d+)(am|pm)/i)
      let startTime = '12:00am'
      let endTime = '1:00am'

      if (hourMatch) {
        const hourNum = parseInt(hourMatch[1])
        const periodStr = hourMatch[2].toLowerCase()
        startTime = `${hourNum}:00${periodStr}`

        // Calculate end time (next hour)
        if (hourNum === 12) {
          endTime = periodStr === 'am' ? '1:00am' : '1:00pm'
        } else if (hourNum === 11) {
          endTime = periodStr === 'am' ? '12:00pm' : '12:00am'
        } else {
          endTime = `${hourNum + 1}:00${periodStr}`
        }
      }

      return {
        ...track,
        hourKey,
        timeAgo: new Date(track.playedAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }),
        hourData: {
          startTime,
          endTime,
          djName: track.djName || 'Unknown DJ',
          djProfileUrl: undefined,
          showName: track.showName || 'Unknown Show',
        },
      }
    })
  }, [tracks])

  // Group tracks by hour and paginate - split into first 2 hours and last 2 hours
  const { firstTwoHours, lastTwoHours, totalPages } = useMemo(() => {
    if (!formattedTracks.length) return { firstTwoHours: [], lastTwoHours: [], totalPages: 0 }

    // First, sort to find unique hours (most recent first)
    const tracksSortedByTime = [...formattedTracks].sort(
      (a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime()
    )

    // Get unique hours in order (most recent hours first)
    const uniqueHours: string[] = []
    tracksSortedByTime.forEach((track) => {
      if (!uniqueHours.includes(track.hourKey)) {
        uniqueHours.push(track.hourKey)
      }
    })

    // Calculate pagination based on hours
    const pages = Math.ceil(uniqueHours.length / HOURS_PER_PAGE)
    const startIndex = currentPage * HOURS_PER_PAGE
    const endIndex = startIndex + HOURS_PER_PAGE

    // Get the hours for the current page
    const currentPageHours = uniqueHours.slice(startIndex, endIndex)

    // Split into first 2 hours and last 2 hours
    const firstTwoPageHours = currentPageHours.slice(0, 2)
    const lastTwoPageHours = currentPageHours.slice(2, 4)

    // Get tracks for first 2 hours
    const tracksForFirstTwo = formattedTracks
      .filter((track) => firstTwoPageHours.includes(track.hourKey))
      .sort((a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime())

    // Get tracks for last 2 hours
    const tracksForLastTwo = formattedTracks
      .filter((track) => lastTwoPageHours.includes(track.hourKey))
      .sort((a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime())

    return {
      firstTwoHours: tracksForFirstTwo,
      lastTwoHours: tracksForLastTwo,
      totalPages: pages,
    }
  }, [formattedTracks, currentPage])

  const handleArticleClick = (article: Article) => {
    navigate(`/articles/${article.id}`, { state: { article } })
  }

  const handlePageChange = (page: number) => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (page === 0) {
      setSearchParams({})
    } else {
      setSearchParams({ page: String(page) })
    }
  }

  // Create breadcrumb items with page number
  const breadcrumbItems =
    currentPage > 0
      ? [
          { label: 'Listen', isClickable: true, onClick: () => navigate('/listen') },
          { label: 'Playlist', isClickable: true, onClick: () => navigate('/playlist') },
          { label: `Page ${currentPage + 1}`, isClickable: false },
        ]
      : [
          { label: 'Listen', isClickable: true, onClick: () => navigate('/listen') },
          { label: 'Playlist', isClickable: false },
        ]

  return (
    <div className="playlist-page">
      <section className="page-container">
        <CrBreadcrumb items={breadcrumbItems} />
      </section>

      <section className="page-container">
        <CrPageHeader title={pageTitle} showEyebrow={false} showActionButton={false} />
      </section>

      {/* First 2 hours */}
      {firstTwoHours.length > 0 && (
        <section className="page-container">
          <CrPlaylistTable items={firstTwoHours} showHeader={true} groupByHour={true} />
        </section>
      )}

      {/* Announcement */}
      <section className="page-section">
        <div className="page-container">
          <CrAnnouncement
            variant="motivation"
            textureBackground={
              'backgroundColor' in randomAnnouncement
                ? ((randomAnnouncement as Record<string, unknown>).backgroundColor as string)
                : 'cr-bg-natural-d100'
            }
            headlineText={
              'title' in randomAnnouncement
                ? ((randomAnnouncement as Record<string, unknown>).title as string)
                : randomAnnouncement.headlineText
            }
            bodyText={
              'message' in randomAnnouncement
                ? ((randomAnnouncement as Record<string, unknown>).message as string)
                : typeof randomAnnouncement.bodyText === 'string'
                  ? randomAnnouncement.bodyText
                  : undefined
            }
            showLink={
              'ctaText' in randomAnnouncement &&
              !!(randomAnnouncement as Record<string, unknown>).ctaText
            }
            linkText={
              'ctaText' in randomAnnouncement
                ? ((randomAnnouncement as Record<string, unknown>).ctaText as string | undefined)
                : undefined
            }
            linkUrl={
              'ctaUrl' in randomAnnouncement
                ? ((randomAnnouncement as Record<string, unknown>).ctaUrl as string | undefined)
                : undefined
            }
            buttonCount="none"
          />
        </div>
      </section>

      {/* Last 2 hours */}
      {lastTwoHours.length > 0 && (
        <section className="page-container">
          <CrPlaylistTable items={lastTwoHours} showHeader={false} groupByHour={true} />
        </section>
      )}

      {/* Pagination */}
      <section className="page-section">
        <div className="page-container">
          <CrPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </section>

      {/* Three article cards in 1/3 1/3 1/3 layout */}
      <section className="page-container">
        <CrPageHeader
          title="Recent Articles"
          titleTag="h2"
          titleSize="lg"
          showEyebrow={false}
          showActionButton={true}
          actionButtonText="View All"
        />
      </section>

      <section className="page-layout-3col">
        <div className="page-layout-3col__column">
          {articles && articles[0] && (
            <CrCard
              variant="small"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              backgroundImage={getArticleImageUrl(articles[0])}
              preheader={getArticleCategoryName(articles[0])}
              title={articles[0].title}
              authorBy={`by ${articles[0].author}`}
              eventDate={new Date(articles[0].publishedDate || Date.now()).toLocaleDateString(
                'en-US',
                {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                }
              )}
              tags={getArticleTags(articles[0])}
              onClick={() => handleArticleClick(articles[0])}
            />
          )}
        </div>
        <div className="page-layout-3col__column">
          {articles && articles[1] && (
            <CrCard
              variant="small"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              backgroundImage={getArticleImageUrl(articles[1])}
              preheader={getArticleCategoryName(articles[1])}
              title={articles[1].title}
              authorBy={`by ${articles[1].author}`}
              eventDate={new Date(articles[1].publishedDate || Date.now()).toLocaleDateString(
                'en-US',
                {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                }
              )}
              tags={getArticleTags(articles[1])}
              onClick={() => handleArticleClick(articles[1])}
            />
          )}
        </div>
        <div className="page-layout-3col__column">
          {articles && articles[2] && (
            <CrCard
              variant="small"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              backgroundImage={getArticleImageUrl(articles[2])}
              preheader={getArticleCategoryName(articles[2])}
              title={articles[2].title}
              authorBy={`by ${articles[2].author}`}
              eventDate={new Date(articles[2].publishedDate || Date.now()).toLocaleDateString(
                'en-US',
                {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                }
              )}
              tags={getArticleTags(articles[2])}
              onClick={() => handleArticleClick(articles[2])}
            />
          )}
        </div>
      </section>
    </div>
  )
}

export default PlaylistPage
