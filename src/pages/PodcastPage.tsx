// src/pages/PodcastPage.tsx
import React from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import CrPageHeader from '../stories/CrPageHeader'
import CrBreadcrumb from '../stories/CrBreadcrumb'
import CrCard from '../stories/CrCard'
import CrAnnouncement from '../stories/CrAnnouncement'
import CrAdSpace from '../stories/CrAdSpace'
import CrPagination from '../stories/CrPagination'
import { usePodcasts, useAnnouncements, useSiteSettings } from '../hooks/useData'
import type { Podcast } from '../types/cms'
import { getAdvertisementProps } from '../utils/categoryHelpers'

const ITEMS_PER_PAGE = 11

// Helper functions for type conversions
const getCategoryName = (podcast: Podcast): string | undefined => {
  if (typeof podcast.category === 'object' && podcast.category && 'name' in podcast.category) {
    return typeof podcast.category === 'object' && podcast.category && 'name' in podcast.category
      ? (podcast.category.name as string)
      : undefined
  }
  if (typeof podcast.category === 'string') {
    return podcast.category
  }
  return undefined
}

const getTags = (podcast: Podcast): string[] | undefined => {
  if (
    Array.isArray(podcast.tags) &&
    podcast.tags.length > 0 &&
    typeof podcast.tags[0] === 'object'
  ) {
    return (podcast.tags as Array<{ tag: string }>).map((t) => t.tag)
  }
  if (Array.isArray(podcast.tags)) {
    return podcast.tags as string[]
  }
  return undefined
}

const PodcastPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: allPodcasts } = usePodcasts()
  const { data: announcements } = useAnnouncements()
  const { data: siteSettings } = useSiteSettings()

  // Get current page from URL, default to 0
  const currentPage = parseInt(searchParams.get('page') || '0', 10)

  const totalPages = allPodcasts ? Math.ceil(allPodcasts.length / ITEMS_PER_PAGE) : 0
  const startIndex = currentPage * ITEMS_PER_PAGE
  const podcasts = allPodcasts?.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handlePodcastClick = (podcast: any) => {
    navigate(`/podcasts/${podcast.slug}`)
  }

  const formatPodcastDate = (podcast: any) => {
    if (!podcast.episodes?.[0]?.publishedDate) return undefined
    return new Date(podcast.episodes[0].publishedDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handlePageChange = (page: number) => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (page === 0) {
      setSearchParams({})
    } else {
      setSearchParams({ page: String(page) })
    }
  }

  // Get sidebar content from Site Settings
  const sidebarAnnouncementId =
    typeof siteSettings?.podcastsSidebarAnnouncement === 'string'
      ? siteSettings.podcastsSidebarAnnouncement
      : typeof siteSettings?.podcastsSidebarAnnouncement === 'object' &&
          siteSettings.podcastsSidebarAnnouncement &&
          'id' in siteSettings.podcastsSidebarAnnouncement
        ? siteSettings.podcastsSidebarAnnouncement.id
        : undefined

  const sidebarAnnouncement = sidebarAnnouncementId
    ? announcements?.find((a) => String(a.id) === String(sidebarAnnouncementId))
    : announcements?.[5] // fallback

  const sidebarAdvertisement = siteSettings?.podcastsSidebarAdvertisement

  // Get full-width announcement from Site Settings
  const fullWidthAnnouncementId =
    typeof siteSettings?.podcastsFullWidthAnnouncement === 'string'
      ? siteSettings.podcastsFullWidthAnnouncement
      : typeof siteSettings?.podcastsFullWidthAnnouncement === 'object' &&
          siteSettings.podcastsFullWidthAnnouncement &&
          'id' in siteSettings.podcastsFullWidthAnnouncement
        ? siteSettings.podcastsFullWidthAnnouncement.id
        : undefined

  const fullWidthAnnouncement = fullWidthAnnouncementId
    ? announcements?.find((a) => String(a.id) === String(fullWidthAnnouncementId))
    : announcements?.[4] // fallback

  const adProps = getAdvertisementProps(sidebarAdvertisement)

  const basePageTitle = siteSettings?.podcastsPageTitle || 'Podcasts'
  const pageTitle = currentPage > 0 ? `${basePageTitle} - Page ${currentPage + 1}` : basePageTitle

  // Create breadcrumb items with page number
  const breadcrumbItems =
    currentPage > 0
      ? [
          { label: 'Podcasts', isClickable: true, onClick: () => navigate('/podcasts') },
          { label: `Page ${currentPage + 1}`, isClickable: false },
        ]
      : [{ label: 'Podcasts', isClickable: false }]

  return (
    <div className="podcast-page">
      {currentPage > 0 && (
        <section className="page-container">
          <CrBreadcrumb items={breadcrumbItems} />
        </section>
      )}

      <section className="page-container">
        <CrPageHeader title={pageTitle} showEyebrow={false} showActionButton={false} />
      </section>

      {/* 2/3 + 1/3 Layout - Featured Podcast */}
      <div className="page-layout-main-sidebar">
        <div className="page-layout-main-sidebar__main">
          {podcasts && podcasts[0] && (
            <CrCard
              variant="default"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              backgroundImage={podcasts[0].coverArt}
              preheader={getCategoryName(podcasts[0])}
              title={podcasts[0].title}
              authorBy={`by ${podcasts[0].host}`}
              eventDate={formatPodcastDate(podcasts[0])}
              tags={getTags(podcasts[0])}
              contentSummary={podcasts[0].excerpt}
              showTicketButton={false}
              onClick={() => handlePodcastClick(podcasts[0])}
            />
          )}
        </div>

        <div className="page-layout-main-sidebar__sidebar">
          {sidebarAnnouncement && (
            <CrAnnouncement
              variant={sidebarAnnouncement.variant}
              widthVariant="third"
              textureBackground={sidebarAnnouncement.textureBackground}
              headlineText={sidebarAnnouncement.headlineText}
              bodyText={
                typeof sidebarAnnouncement.bodyText === 'string'
                  ? sidebarAnnouncement.bodyText
                  : undefined
              }
              showLink={sidebarAnnouncement.showLink}
              linkText={sidebarAnnouncement.linkText}
              linkUrl={sidebarAnnouncement.linkUrl}
              buttonCount={sidebarAnnouncement.buttonCount}
            />
          )}
          {adProps && <CrAdSpace {...adProps} />}
        </div>
      </div>

      {/* 50/50 Layout - 4 Podcasts */}
      <section className="page-layout-2col">
        <div className="page-layout-2col__column">
          {podcasts && podcasts[1] && (
            <CrCard
              variant="wide"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              imageAspectRatio="16:9"
              backgroundImage={podcasts[1].coverArt}
              preheader={getCategoryName(podcasts[1])}
              title={podcasts[1].title}
              authorBy={`by ${podcasts[1].host}`}
              eventDate={formatPodcastDate(podcasts[1])}
              tags={getTags(podcasts[1])}
              contentSummary={podcasts[1].excerpt}
              showTicketButton={false}
              showShareButton={false}
              onClick={() => handlePodcastClick(podcasts[1])}
            />
          )}
          {podcasts && podcasts[2] && (
            <CrCard
              variant="wide"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              imageAspectRatio="16:9"
              backgroundImage={podcasts[2].coverArt}
              preheader={getCategoryName(podcasts[2])}
              title={podcasts[2].title}
              authorBy={`by ${podcasts[2].host}`}
              eventDate={formatPodcastDate(podcasts[2])}
              tags={getTags(podcasts[2])}
              contentSummary={podcasts[2].excerpt}
              showTicketButton={false}
              showShareButton={false}
              onClick={() => handlePodcastClick(podcasts[2])}
            />
          )}
        </div>
        <div className="page-layout-2col__column">
          {podcasts && podcasts[3] && (
            <CrCard
              variant="wide"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              imageAspectRatio="16:9"
              backgroundImage={podcasts[3].coverArt}
              preheader={getCategoryName(podcasts[3])}
              title={podcasts[3].title}
              authorBy={`by ${podcasts[3].host}`}
              eventDate={formatPodcastDate(podcasts[3])}
              tags={getTags(podcasts[3])}
              contentSummary={podcasts[3].excerpt}
              showTicketButton={false}
              showShareButton={false}
              onClick={() => handlePodcastClick(podcasts[3])}
            />
          )}
          {podcasts && podcasts[4] && (
            <CrCard
              variant="wide"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              imageAspectRatio="16:9"
              backgroundImage={podcasts[4].coverArt}
              preheader={getCategoryName(podcasts[4])}
              title={podcasts[4].title}
              authorBy={`by ${podcasts[4].host}`}
              eventDate={formatPodcastDate(podcasts[4])}
              tags={getTags(podcasts[4])}
              contentSummary={podcasts[4].excerpt}
              showTicketButton={false}
              showShareButton={false}
              onClick={() => handlePodcastClick(podcasts[4])}
            />
          )}
        </div>
      </section>

      {/* Announcement */}
      <section className="page-section">
        <div className="page-container">
          {fullWidthAnnouncement && (
            <CrAnnouncement
              variant={fullWidthAnnouncement.variant}
              textureBackground={fullWidthAnnouncement.textureBackground}
              headlineText={fullWidthAnnouncement.headlineText}
              bodyText={
                typeof fullWidthAnnouncement.bodyText === 'string'
                  ? fullWidthAnnouncement.bodyText
                  : undefined
              }
              showLink={fullWidthAnnouncement.showLink}
              linkText={fullWidthAnnouncement.linkText}
              linkUrl={fullWidthAnnouncement.linkUrl}
              buttonCount={fullWidthAnnouncement.buttonCount}
            />
          )}
        </div>
      </section>

      {/* 1/3 + 1/3 + 1/3 Layout - 6 Podcasts */}
      <section className="page-layout-3col">
        <div className="page-layout-3col__column">
          {podcasts && podcasts[5] && (
            <CrCard
              variant="narrow"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              showMetaTop={true}
              backgroundImage={podcasts[5].coverArt}
              preheader={getCategoryName(podcasts[5])}
              title={podcasts[5].title}
              authorBy={`by ${podcasts[5].host}`}
              eventDate={formatPodcastDate(podcasts[5])}
              tags={getTags(podcasts[5])}
              contentSummary={podcasts[5].excerpt}
              showTicketButton={false}
              onClick={() => handlePodcastClick(podcasts[5])}
            />
          )}
          {podcasts && podcasts[6] && (
            <CrCard
              variant="narrow"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              showMetaTop={true}
              backgroundImage={podcasts[6].coverArt}
              preheader={getCategoryName(podcasts[6])}
              title={podcasts[6].title}
              authorBy={`by ${podcasts[6].host}`}
              eventDate={formatPodcastDate(podcasts[6])}
              tags={getTags(podcasts[6])}
              contentSummary={podcasts[6].excerpt}
              showTicketButton={false}
              onClick={() => handlePodcastClick(podcasts[6])}
            />
          )}
        </div>
        <div className="page-layout-3col__column">
          {podcasts && podcasts[7] && (
            <CrCard
              variant="narrow"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              showMetaTop={true}
              backgroundImage={podcasts[7].coverArt}
              preheader={getCategoryName(podcasts[7])}
              title={podcasts[7].title}
              authorBy={`by ${podcasts[7].host}`}
              eventDate={formatPodcastDate(podcasts[7])}
              tags={getTags(podcasts[7])}
              contentSummary={podcasts[7].excerpt}
              showTicketButton={false}
              onClick={() => handlePodcastClick(podcasts[7])}
            />
          )}
          {podcasts && podcasts[8] && (
            <CrCard
              variant="narrow"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              showMetaTop={true}
              backgroundImage={podcasts[8]?.coverArt}
              preheader={getCategoryName(podcasts[8])}
              title={podcasts[8]?.title}
              authorBy={`by ${podcasts[8]?.host}`}
              eventDate={formatPodcastDate(podcasts[8])}
              tags={getTags(podcasts[8])}
              contentSummary={podcasts[8]?.excerpt}
              showTicketButton={false}
              onClick={() => handlePodcastClick(podcasts[8])}
            />
          )}
        </div>
        <div className="page-layout-3col__column">
          {podcasts && podcasts[9] && (
            <CrCard
              variant="narrow"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              showMetaTop={true}
              backgroundImage={podcasts[9].coverArt}
              preheader={getCategoryName(podcasts[9])}
              title={podcasts[9].title}
              authorBy={`by ${podcasts[9].host}`}
              eventDate={formatPodcastDate(podcasts[9])}
              tags={getTags(podcasts[9])}
              contentSummary={podcasts[9].excerpt}
              showTicketButton={false}
              onClick={() => handlePodcastClick(podcasts[9])}
            />
          )}
          {podcasts && podcasts[10] && (
            <CrCard
              variant="narrow"
              type="article"
              bannerHeight="tall"
              textLayout="stacked"
              showMetaTop={true}
              backgroundImage={podcasts[10].coverArt}
              preheader={getCategoryName(podcasts[10])}
              title={podcasts[10].title}
              authorBy={`by ${podcasts[10].host}`}
              eventDate={formatPodcastDate(podcasts[10])}
              tags={getTags(podcasts[10])}
              contentSummary={podcasts[10].excerpt}
              showTicketButton={false}
              onClick={() => handlePodcastClick(podcasts[10])}
            />
          )}
        </div>
      </section>

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
    </div>
  )
}

export default PodcastPage
