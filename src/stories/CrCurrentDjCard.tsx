// CrCurrentDjCard.tsx
import CrCurrentDj from './CrCurrentDj'
import CrButton from './CrButton'
import CrChip from './CrChip'
import { PiMusicNote, PiHeart, PiHeartFill, PiArrowRight } from 'react-icons/pi'
import './CrCurrentDjCard.css'

interface CrCurrentDjCardProps {
  djImage?: string
  djImageAlt?: string
  djName?: string
  showName?: string
  isOnAir?: boolean
  description?: string
  requestButtonText?: string
  moreButtonText?: string
  favoriteButtonText?: string
  onRequestClick?: () => void
  onMoreClick?: () => void
  onFavoriteClick?: () => void
  className?: string
  isFavorite?: boolean
  showRequestButton?: boolean
  showFavoriteButton?: boolean
  showMoreButton?: boolean
}

export default function CrCurrentDjCard({
  // Image
  djImage = `${import.meta.env.VITE_CMS_API_URL}/player-fallback-images/file/album-art-8-600x600.png`,
  djImageAlt = 'DJ Current',

  // CrCurrentDj props
  djName = 'DJ Current',
  showName = 'The Current Show',
  isOnAir = true,

  // Content
  description = 'DJ Current is lorem ipsum dolor sit amet, c...',

  // Button props
  requestButtonText = 'Request Song',
  moreButtonText = 'Profile',
  favoriteButtonText = 'Favorite DJ',
  onRequestClick,
  onMoreClick,
  onFavoriteClick,

  className = '',
  isFavorite = false,
  showRequestButton = true,
  showFavoriteButton = true,
  showMoreButton = true,
}: CrCurrentDjCardProps) {
  return (
    <div className={`cr-current-dj-card ${className}`}>
      <div className="cr-current-dj-card__top">
        <CrCurrentDj djName={djName} showName={showName} isOnAir={isOnAir} />
      </div>

      <div className="cr-current-dj-card__content">
        <div className="cr-current-dj-card__image-container">
          <img src={djImage} alt={djImageAlt} className="cr-current-dj-card__image" />
          {isFavorite && (
            <div className="cr-current-dj-card__favorite-badge">
              <CrChip variant="secondary-light" size="small" squared>
                FAVORITE
              </CrChip>
            </div>
          )}
        </div>

        <div className="cr-current-dj-card__info">
          <p className="cr-current-dj-card__description">{description}</p>
          {showMoreButton && (
            <CrButton
              variant="solid"
              color="default"
              size="small"
              rightIcon={<PiArrowRight />}
              onClick={onMoreClick}
            >
              {moreButtonText}
            </CrButton>
          )}
        </div>
      </div>

      <div className="cr-current-dj-card__actions">
        {showFavoriteButton && onFavoriteClick && (
          <CrButton
            variant="text"
            color="default"
            size="xsmall"
            leftIcon={isFavorite ? <PiHeartFill /> : <PiHeart />}
            onClick={onFavoriteClick}
          >
            {favoriteButtonText}
          </CrButton>
        )}

        {showRequestButton && (
          <CrButton
            variant="text"
            color="secondary"
            size="xsmall"
            leftIcon={<PiMusicNote />}
            onClick={onRequestClick}
          >
            {requestButtonText}
          </CrButton>
        )}
      </div>
    </div>
  )
}
