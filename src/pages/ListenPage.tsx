// src/pages/ListenPage.tsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { PiVinylRecord, PiPlaylist } from 'react-icons/pi'
import CrPageHeader from '../stories/CrPageHeader'
import CrPlaylistTable from '../stories/CrPlaylistTable'
import CrAnnouncement from '../stories/CrAnnouncement'
import CrList from '../stories/CrList'
import CrAdSpace from '../stories/CrAdSpace'
import { useCurrentUser, useAnnouncements, useSiteSettings } from '../hooks/useData'
import { useTracksPlayed } from '../hooks/useTracksPlayed'
import { useNotification } from '../contexts/NotificationContext'
import { getCollection, removeFromCollection, type CollectionTrack } from '../utils/collectionDB'
import './ListenPage.css'

const ListenPage: React.FC = () => {
  const navigate = useNavigate()
  const { data: tracks } = useTracksPlayed({ limit: 200, page: 1 })
  const { data: currentUser } = useCurrentUser()
  const { data: announcements } = useAnnouncements()
  const { data: siteSettings } = useSiteSettings()
  const { showModal, showToast } = useNotification()
  const [collection, setCollection] = useState<CollectionTrack[]>([])

  // Transform tracks for playlist table - only show last 2 hours
  const recentlyPlayedTracks = React.useMemo(() => {
    if (!tracks || tracks.length === 0) return []

    // Add hourKey to each track based on playedAt timestamp (in Chicago timezone)
    const tracksWithHourKey = tracks.map((track) => {
      const playedDate = new Date(track.playedAt)
      // Get hour in Chicago timezone
      const chicagoTime = playedDate.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        hour12: false,
      })
      const hour = parseInt(chicagoTime.split(',')[1]?.trim() || chicagoTime)
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
      const period = hour < 12 ? 'am' : 'pm'
      const hourKey = `${hour12}${period}`
      return { ...track, hourKey }
    })

    // First, find the most recent 2 unique hours by sorting tracks by time
    const tracksSortedByTime = [...tracksWithHourKey].sort(
      (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime()
    )

    // Get unique hours from sorted tracks (most recent hours first)
    const uniqueHours: string[] = []
    tracksSortedByTime.forEach((track) => {
      if (!uniqueHours.includes(track.hourKey)) {
        uniqueHours.push(track.hourKey)
      }
    })

    // Get only the first 2 unique hours (most recent)
    const recentHours = uniqueHours.slice(0, 2)

    // Filter tracks from those 2 hours, then sort NEWEST to OLDEST (reverse chronological)
    const filteredTracks = tracksWithHourKey
      .filter((track) => recentHours.includes(track.hourKey))
      .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())

    // Map to the format needed
    return filteredTracks.map((track) => {
      // Parse the hourKey to determine start/end times
      const hourMatch = track.hourKey?.match(/(\d+)(am|pm)/i)
      let startTime = '12:00am'
      let endTime = '1:00am'

      if (hourMatch) {
        const hour = parseInt(hourMatch[1])
        const period = hourMatch[2].toLowerCase()
        startTime = `${hour}:00${period}`

        // Calculate end time (next hour)
        if (hour === 12) {
          endTime = period === 'am' ? '1:00am' : '1:00pm'
        } else if (hour === 11) {
          endTime = period === 'am' ? '12:00pm' : '12:00am'
        } else {
          endTime = `${hour + 1}:00${period}`
        }
      }

      return {
        albumArt: track.albumArt,
        artistName: track.artistName,
        trackName: track.trackName,
        albumName: track.albumName,
        labelName: track.labelName,
        isLocal: track.isLocal,
        timeAgo: new Date(track.playedAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/Chicago',
        }),
        hourKey: track.hourKey,
        hourData: {
          startTime,
          endTime,
          djName: track.djName,
          showName: track.showName,
          djProfileUrl: '#',
        },
      }
    })
  }, [tracks])

  // Load collection on mount
  useEffect(() => {
    setCollection(getCollection())
  }, [])

  // Listen for collection updates
  useEffect(() => {
    const handleCollectionUpdate = () => {
      setCollection(getCollection())
    }

    window.addEventListener('chirp-collection-updated', handleCollectionUpdate)
    return () => {
      window.removeEventListener('chirp-collection-updated', handleCollectionUpdate)
    }
  }, [])

  // Handle removing tracks from collection
  const handleItemRemove = (item: any, _index: number) => {
    showModal({
      title: 'Remove from Collection',
      message: `Are you sure you want to remove ${item.trackName} by ${item.artistName} from your collection?`,
      confirmText: 'Yes, Remove',
      cancelText: 'No',
      onConfirm: () => {
        const removed = removeFromCollection(item.id)
        if (removed) {
          showToast({
            message: `Removed ${item.trackName} by ${item.artistName} from your collection`,
            type: 'success',
            duration: 5000,
          })
        }
      },
    })
  }

  // Get user collection for sidebar (first 3 items)
  const userCollectionTracks = collection.slice(0, 3).map((track) => ({
    ...track,
    albumArt: track.albumArt,
    artistName: track.artistName,
    trackName: track.trackName,
    albumName: track.albumName,
    labelName: track.labelName,
    isLocal: track.isLocal,
    isAdded: true,
    timeAgo: `Added on ${new Date(track.dateAdded).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`,
  }))

  // Get sidebar content from Site Settings

  const fullWidthAnnouncementId =
    typeof siteSettings?.fullWidthAnnouncement === 'string'
      ? siteSettings.fullWidthAnnouncement
      : typeof siteSettings?.fullWidthAnnouncement === 'object' &&
          siteSettings.fullWidthAnnouncement &&
          'id' in siteSettings.fullWidthAnnouncement
        ? siteSettings.fullWidthAnnouncement.id
        : undefined

  const fullWidthAnnouncement = fullWidthAnnouncementId
    ? announcements?.find((a) => a.id === fullWidthAnnouncementId)
    : announcements?.[2] // fallback

  const sidebarAdvertisement = siteSettings?.listenSidebarAdvertisement

  // Get weekly charts from Site Settings (these are populated WeeklyChart objects from CMS)
  const leftWeeklyChart =
    typeof siteSettings?.leftWeeklyChart === 'object' ? siteSettings.leftWeeklyChart : null
  const rightWeeklyChart =
    typeof siteSettings?.rightWeeklyChart === 'object' ? siteSettings.rightWeeklyChart : null
  const sidebarWeeklyChart =
    typeof siteSettings?.listenSidebarWeeklyChart === 'object'
      ? siteSettings.listenSidebarWeeklyChart
      : null

  // Get page text content from CMS with fallbacks
  const pageTitle = (siteSettings?.listenPageTitle as string) || 'Listen'
  const currentPlaylistTitle =
    (siteSettings?.listenCurrentPlaylistTitle as string) || 'Current Playlist'
  const previousPlaysButtonText =
    (siteSettings?.listenPreviousPlaysButtonText as string) || 'Previous Plays'
  const userCollectionTitle =
    (siteSettings?.listenUserCollectionTitle as string) || 'A Few from Your Collection'
  const yourCollectionButtonText =
    (siteSettings?.listenYourCollectionButtonText as string) || 'Your Collection'

  return (
    <div className="listen-page">
      <section className="page-container">
        <CrPageHeader title={pageTitle} showEyebrow={false} showActionButton={false} />
      </section>

      <div className="page-layout-main-sidebar">
        <div className="page-layout-main-sidebar__main">
          <CrPageHeader
            title={currentPlaylistTitle}
            titleTag="h2"
            titleSize="lg"
            showEyebrow={false}
            showActionButton={true}
            actionButtonText={previousPlaysButtonText}
            actionButtonIcon={<PiVinylRecord />}
            onActionClick={() => navigate('/playlist')}
          />
          <CrPlaylistTable
            items={recentlyPlayedTracks}
            showHeader={true}
            groupByHour={true}
            className="listen-page__playlist"
          />
        </div>

        <div className="page-layout-main-sidebar__sidebar">
          {currentUser && collection.length > 0 && (
            <>
              <CrPageHeader
                title={userCollectionTitle}
                titleTag="h3"
                titleSize="md"
                showEyebrow={false}
                showActionButton={true}
                actionButtonText={yourCollectionButtonText}
                actionButtonIcon={<PiPlaylist />}
                actionButtonSize="medium"
                onActionClick={() => navigate('/collection')}
              />
              <CrPlaylistTable
                items={userCollectionTracks}
                showHeader={false}
                groupByHour={false}
                variant="default"
                onItemAddClick={handleItemRemove}
              />
            </>
          )}
          {sidebarWeeklyChart && (
            <CrList
              preheader={sidebarWeeklyChart.preheader}
              title={sidebarWeeklyChart.title}
              showActionButton={false}
              showAddButton={false}
              items={sidebarWeeklyChart.tracks || []}
            />
          )}
          {sidebarAdvertisement && (
            <CrAdSpace
              size={sidebarAdvertisement.size || 'large-rectangle'}
              customWidth={sidebarAdvertisement.customWidth}
              customHeight={sidebarAdvertisement.customHeight}
              contentType={sidebarAdvertisement.contentType}
              src={sidebarAdvertisement.imageUrl || sidebarAdvertisement.image?.url}
              alt={sidebarAdvertisement.alt}
              htmlContent={sidebarAdvertisement.htmlContent}
              videoSrc={sidebarAdvertisement.videoUrl || sidebarAdvertisement.video?.url}
              embedCode={sidebarAdvertisement.embedCode}
              href={sidebarAdvertisement.href}
              target={sidebarAdvertisement.target}
              showLabel={sidebarAdvertisement.showLabel}
            />
          )}
        </div>
      </div>

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
              button1Text={fullWidthAnnouncement.button1Text}
              button1Icon={fullWidthAnnouncement.button1Icon}
              button2Text={fullWidthAnnouncement.button2Text}
              button2Icon={fullWidthAnnouncement.button2Icon}
              currentAmount={fullWidthAnnouncement.currentAmount}
              targetAmount={fullWidthAnnouncement.targetAmount}
            />
          )}
        </div>
      </section>

      <section className="page-layout-2col">
        <div className="page-layout-2col__column">
          {leftWeeklyChart && (
            <CrList
              preheader={leftWeeklyChart.preheader}
              title={leftWeeklyChart.title || 'Top 25'}
              bannerButtonText="View Full Chart"
              items={leftWeeklyChart.tracks || []}
            />
          )}
        </div>
        <div className="page-layout-2col__column">
          {rightWeeklyChart && (
            <CrList
              preheader={rightWeeklyChart.preheader}
              title={rightWeeklyChart.title || 'Most Added'}
              bannerButtonText="View All Local"
              items={rightWeeklyChart.tracks || []}
            />
          )}
        </div>
      </section>
    </div>
  )
}

export default ListenPage
