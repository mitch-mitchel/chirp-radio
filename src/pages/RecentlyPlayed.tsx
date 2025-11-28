// src/pages/RecentlyPlayed.tsx
import { useState, useEffect, useMemo } from 'react'
import CrPageHeader from '../stories/CrPageHeader'
import CrPlaylistTable from '../stories/CrPlaylistTable'
import CrAnnouncement from '../stories/CrAnnouncement'
import { useNotification } from '../contexts/NotificationContext'
import { useAuth } from '../hooks/useAuth'
import { addToCollection, removeFromCollection, isInCollection } from '../utils/collectionDB'
import LoginRequiredModal from '../stories/CrLoginRequiredModal'
import { useMobilePageByIdentifier, useSiteSettings } from '../hooks/useData'
import { useTracksPlayed } from '../hooks/useTracksPlayed'

export default function RecentlyPlayed() {
  const { showToast } = useNotification()
  const { isLoggedIn, login, signup } = useAuth()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const { data: pageContent } = useMobilePageByIdentifier('recently-played')
  const { data: tracks } = useTracksPlayed({ limit: 200, page: 1 })
  const { data: siteSettings } = useSiteSettings()

  // Get page header content from CMS with fallbacks
  const pageTitle = pageContent?.pageTitle || 'Recently Played'
  const actionButtonText =
    (pageContent && 'actionButtonText' in pageContent
      ? ((pageContent as Record<string, unknown>).actionButtonText as string)
      : undefined) || 'Complete Playlist'
  const completePlaylistUrl =
    (siteSettings && 'completePlaylistUrl' in siteSettings
      ? ((siteSettings as Record<string, unknown>).completePlaylistUrl as string)
      : undefined) || 'https://chirpradio.org/playlists'

  // Get the announcement from CMS (now populated and transformed with depth: 1)
  const announcementValue =
    pageContent && 'announcement' in pageContent
      ? (pageContent as Record<string, unknown>).announcement
      : undefined
  const selectedAnnouncement =
    typeof announcementValue === 'object' && announcementValue !== null ? announcementValue : null

  // Format tracks with hour data for display (take only the 2 most recent hours)
  const playlistItems = useMemo(() => {
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
    const recentTracks = tracksWithHourKey
      .filter((track) => recentHours.includes(track.hourKey))
      .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())

    return recentTracks.map((track) => {
      const playedDate = new Date(track.playedAt)
      const timeString = playedDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
      })

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
        ...track,
        timeAgo: timeString,
        albumArtAlt: `${track.albumName} album cover`,
        hourData: {
          startTime,
          endTime,
          djName: track.djName || 'Unknown DJ',
          djProfileUrl:
            'djImage' in track
              ? ((track as Record<string, unknown>).djImage as string | undefined)
              : undefined,
          showName: track.showName || 'Unknown Show',
        },
        isAdded: isInCollection(track.artistName, track.trackName),
      }
    })
  }, [tracks])

  // Update isAdded status when collection changes
  useEffect(() => {
    // Force re-render when collection updates
    const handleCollectionUpdate = () => {
      // The useMemo above will recompute with updated isInCollection values
      window.dispatchEvent(new Event('chirp-collection-updated-internal'))
    }

    window.addEventListener('chirp-collection-updated', handleCollectionUpdate)
    return () => {
      window.removeEventListener('chirp-collection-updated', handleCollectionUpdate)
    }
  }, [])

  const handleItemAdd = (item: any, _index: number) => {
    // Check if user is logged in
    if (!isLoggedIn) {
      setShowLoginModal(true)
      return
    }

    if (item.isAdded) {
      // Remove from collection
      const removed = removeFromCollection(item.id)
      if (removed) {
        showToast({
          message: `Removed ${item.trackName} from your collection`,
          type: 'success',
          duration: 3000,
        })
      }
    } else {
      // Add to collection
      // Use CHIRP logo as fallback if no album art
      const albumArtUrl = item.albumArt || '/src/assets/chirp-logos/CHIRP_Logo_FM URL_record.svg'

      addToCollection({
        id: item.id,
        artistName: item.artistName,
        trackName: item.trackName,
        albumName: item.albumName,
        labelName: item.labelName,
        albumArt: albumArtUrl,
        albumArtAlt: item.albumArtAlt,
        isLocal: item.isLocal,
      })
      showToast({
        message: `Added ${item.trackName} to your collection`,
        type: 'success',
        duration: 3000,
      })
    }
  }

  const handleLogin = (email: string, _password: string) => {
    login(email, email.split('@')[0])
    setShowLoginModal(false)
    showToast({
      message: 'Successfully logged in!',
      type: 'success',
      duration: 3000,
    })
  }

  const handleSignUp = (email: string, _password: string) => {
    signup(email, email.split('@')[0])
    setShowLoginModal(false)
    showToast({
      message: 'Account created successfully!',
      type: 'success',
      duration: 3000,
    })
  }

  const handleCompletePlaylist = () => {
    window.open(completePlaylistUrl as string, '_blank')
  }

  return (
    <div className="page-container">
      <CrPageHeader
        eyebrowText="CHIRP Radio"
        title={pageTitle}
        showEyebrow={false}
        showActionButton={true}
        actionButtonText={actionButtonText}
        actionButtonSize="small"
        onActionClick={handleCompletePlaylist}
        titleSize="lg"
      />

      <CrPlaylistTable
        items={playlistItems}
        showHeader={true}
        groupByHour={true}
        onItemAddClick={handleItemAdd}
      />

      {selectedAnnouncement && (
        <CrAnnouncement
          variant={(selectedAnnouncement as Record<string, unknown>).variant as string}
          textureBackground={
            (selectedAnnouncement as Record<string, unknown>).textureBackground as string
          }
          headlineText={(selectedAnnouncement as Record<string, unknown>).headlineText as string}
          bodyText={(selectedAnnouncement as Record<string, unknown>).bodyText as string}
          showLink={(selectedAnnouncement as Record<string, unknown>).showLink as boolean}
          linkText={(selectedAnnouncement as Record<string, unknown>).linkText as string}
          linkUrl={(selectedAnnouncement as Record<string, unknown>).linkUrl as string}
          buttonCount={(selectedAnnouncement as Record<string, unknown>).buttonCount as string}
          button1Text={(selectedAnnouncement as Record<string, unknown>).button1Text as string}
          button1Icon={(selectedAnnouncement as Record<string, unknown>).button1Icon as string}
          button2Text={(selectedAnnouncement as Record<string, unknown>).button2Text as string}
          button2Icon={(selectedAnnouncement as Record<string, unknown>).button2Icon as string}
          currentAmount={(selectedAnnouncement as Record<string, unknown>).currentAmount as number}
          targetAmount={(selectedAnnouncement as Record<string, unknown>).targetAmount as number}
        />
      )}

      <LoginRequiredModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
        onSignUp={handleSignUp}
      />
    </div>
  )
}
