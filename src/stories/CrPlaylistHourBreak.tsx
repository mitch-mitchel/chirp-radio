// CrPlaylistHourBreak.tsx
import { PiCaretDown } from 'react-icons/pi'
import CrChip from './CrChip'
import './CrPlaylistHourBreak.css'

interface CrPlaylistHourBreakProps {
  startTime?: string
  endTime?: string
  djName?: string
  djProfileUrl?: string
  showName?: string
  isOnAir?: boolean
  isCollapsed?: boolean
  showChevron?: boolean
  className?: string
}

export default function CrPlaylistHourBreak({
  startTime = '1:00pm',
  endTime = '2:00pm',
  djName = 'DJ Current',
  djProfileUrl = '#',
  _showName = '',
  isOnAir = false,
  isCollapsed = false,
  showChevron = true,
  className = '',
}: CrPlaylistHourBreakProps) {
  return (
    <div className={`cr-playlist-hour-break ${className}`}>
      {showChevron && (
        <div
          className={`cr-playlist-hour-break__chevron ${isCollapsed ? 'cr-playlist-hour-break__chevron--collapsed' : ''}`}
        >
          <PiCaretDown />
        </div>
      )}
      <span className="cr-playlist-hour-break__time">
        {startTime} - {endTime}
      </span>
      <span className="cr-playlist-hour-break__separator">–</span>
      <a
        href={djProfileUrl}
        className="cr-playlist-hour-break__dj-link"
        onClick={(e) => e.stopPropagation()}
      >
        {djName}
      </a>
      {isOnAir && (
        <CrChip variant="primary" aria-hidden={true}>
          On-Air
        </CrChip>
      )}
      <div className="cr-playlist-hour-break__line"></div>
    </div>
  )
}
