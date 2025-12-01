// CrRecentlyPlayed.tsx
import { useRef, useEffect, useState } from 'react'
import CrPlaylistItem from '../stories/CrPlaylistItem'
import CrPlaylistHourBreak from '../stories/CrPlaylistHourBreak'
import CrButton from '../stories/CrButton'
import { PiPlaylist } from 'react-icons/pi'
import './CrRecentlyPlayed.css'

interface Track {
  albumArt?: string
  albumArtAlt?: string
  artistName?: string
  trackName?: string
  albumName?: string
  labelName?: string
  isAdded?: boolean
  isLocal?: boolean
  timeAgo?: string
}

interface DjInfo {
  djName: string
  showName: string
  startTime: string
  endTime: string
  djProfileUrl?: string
}

interface CrRecentlyPlayedProps {
  tracks?: Track[]
  showViewPlaylistButton?: boolean
  onViewPlaylist?: () => void
  maxItems?: number
  djName?: string
  showName?: string
  startTime?: string
  endTime?: string
  djProfileUrl?: string
}

export default function CrRecentlyPlayed({
  tracks = [],
  showViewPlaylistButton = true,
  onViewPlaylist,
  maxItems = 6,
  djName = 'Current DJ',
  showName = 'Current Show',
  startTime = '12:00pm',
  endTime = '1:00pm',
  djProfileUrl = '#',
}: CrRecentlyPlayedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showGradient, setShowGradient] = useState(true)
  const [showGradientLeft, setShowGradientLeft] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // DJ info from props
  const djInfo: DjInfo = {
    djName,
    showName,
    startTime,
    endTime,
    djProfileUrl,
  }

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    // Initial check
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainer
      // Only show gradient if content is wider than container AND not scrolled to the end
      const hasOverflow = scrollWidth > clientWidth
      const isNearEnd = scrollLeft + clientWidth >= scrollWidth - 50
      const isNearStart = scrollLeft <= 10
      setShowGradient(hasOverflow && !isNearEnd)
      setShowGradientLeft(hasOverflow && !isNearStart)
    }

    // Initial check
    handleScroll()

    // Also check on window resize
    const handleResize = () => handleScroll()
    window.addEventListener('resize', handleResize)

    scrollContainer.addEventListener('scroll', handleScroll)
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const displayedTracks = tracks.slice(0, maxItems)

  return (
    <div className="cr-recently-played cr-bg-textured cr-bg-dust-d300">
      <div className="cr-recently-played__container">
        <div className="cr-recently-played__header">
          <h2 className="cr-recently-played__title">Recently Played</h2>
          {showViewPlaylistButton && (
            <CrButton
              variant="outline"
              size="medium"
              color="secondary"
              rightIcon={<PiPlaylist />}
              onClick={onViewPlaylist}
            >
              View Playlist
            </CrButton>
          )}
        </div>

        <CrPlaylistHourBreak
          startTime={djInfo.startTime}
          endTime={djInfo.endTime}
          djName={djInfo.djName}
          showName={djInfo.showName}
          djProfileUrl={djInfo.djProfileUrl}
          isCollapsed={false}
          showChevron={false}
        />

        <div
          className={`cr-recently-played__scroll-wrapper ${showGradient ? 'cr-recently-played__scroll-wrapper--gradient' : ''} ${showGradientLeft ? 'cr-recently-played__scroll-wrapper--gradient-left' : ''}`}
        >
          <div className="cr-recently-played__scroll-container" ref={scrollRef}>
            <div className="cr-recently-played__track-list">
              {displayedTracks.map((track, index) => (
                <CrPlaylistItem
                  key={index}
                  variant={isMobile ? 'table' : 'card'}
                  albumArt={track.albumArt}
                  albumArtAlt={track.albumArtAlt}
                  artistName={track.artistName}
                  trackName={track.trackName}
                  albumName={track.albumName}
                  labelName={track.labelName}
                  isAdded={track.isAdded}
                  isLocal={track.isLocal}
                  timeAgo={track.timeAgo}
                  showTime={true}
                  currentlyPlaying={index === 0}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
