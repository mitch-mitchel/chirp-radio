// CrProfileCard.tsx
import { useState, useEffect } from 'react'
import { PiHeart, PiPencilSimple, PiUser } from 'react-icons/pi'
import CrButton from './CrButton'
import CrChip from './CrChip'
import CrPageHeader from './CrPageHeader'
import './CrProfileCard.css'
import CrProfileEditForm from './CrProfileEditForm'
import CrSettingsToggles from './CrSettingsToggles'
import CrSocialIcon from './CrSocialIcon'
import CrVolunteerEditForm from './CrVolunteerEditForm'

interface CrProfileCardProps {
  state?: 'view' | 'editProfile' | 'editVolunteer' | 'signedOut'
  eyebrowText?: string
  title?: string
  showEditButton?: boolean
  onEditClick?: () => void
  firstName?: string
  lastName?: string
  location?: string
  email?: string
  memberSince?: string
  avatarSrc?: string
  fullProfileImage?: string
  avatarAlt?: string
  socialLinks?: Array<{ platform: string; url: string }>
  permissions?: string[]
  showPermissions?: boolean
  isVolunteer?: boolean
  isDJ?: boolean
  djId?: number
  djName?: string
  showName?: string
  showTime?: string
  onStateChange?: (state: string) => void
  onSave?: () => void
  onCancel?: () => void
  onChange?: (field: string, value: any) => void
  formData?: any
  maxWidth?: string
  className?: string
  // Account Settings props
  streamingQuality?: string
  onStreamingQualityChange?: (quality: string) => void
  pushNotifications?: boolean
  onPushNotificationsChange?: (checked: boolean) => void
  darkMode?: 'light' | 'dark' | 'device'
  onDarkModeChange?: (mode: 'light' | 'dark' | 'device') => void
  onLogin?: () => void
  onSignOut?: () => void
  onSignUp?: () => void
  onForgotPassword?: () => void
  onShareApp?: () => void
  onLikeAppStore?: () => void
  onAppSupport?: () => void
  onTermsPrivacy?: () => void
  onViewDJProfile?: () => void
}

export default function CrProfileCard({
  // Component state
  state = 'view', // "view" | "editProfile" | "editVolunteer" | "signedOut"

  // Header section
  eyebrowText = 'CHIRP Radio',
  title = 'Profile - Edit',
  showEditButton = true,
  onEditClick,

  // Profile info
  firstName = 'Person',
  lastName = 'Name',
  location = 'Chicago, Illinois',
  email = 'email@qmail.com',
  memberSince = 'September 30, 2008',

  // Avatar
  avatarSrc,
  fullProfileImage,
  avatarAlt = 'User avatar',

  // Social links
  socialLinks = [
    { platform: 'facebook', url: 'www.facebook.com/thisguyrighthere' },
    { platform: 'instagram', url: 'www.instagram.com/thisguydoingstuff' },
    { platform: 'twitter', url: 'www.twitter.com/thisguytakingtrash' },
    { platform: 'tiktok', url: 'www.tiktok.com/@thisguydancing' },
    { platform: 'linkedin', url: 'www.linkedin.com/thisguybuttonedup' },
    { platform: 'bluesky', url: 'www.bluesky.com/thisguygettingaway' },
  ],

  // Permissions
  permissions = ['Default', 'Admin', 'Board Member', 'DJ', 'Content Publisher', 'Volunteer'],
  showPermissions = true,

  // User role for determining what edit options to show
  isVolunteer = false, // true if user has volunteer permissions
  isDJ = false, // true if user has DJ permissions
  djId,
  djName,
  showName,
  showTime,

  // State change handlers
  onStateChange, // Callback to change state between editProfile/editVolunteer

  // Form handlers
  onSave,
  onCancel,
  onChange,

  // Form data
  formData = {},

  // Account Settings
  streamingQuality = '128',
  onStreamingQualityChange,
  pushNotifications = false,
  onPushNotificationsChange,
  darkMode = 'light',
  onDarkModeChange,
  onLogin,
  onSignOut,
  onSignUp,
  onForgotPassword,
  onShareApp: _onShareApp,
  onLikeAppStore: _onLikeAppStore,
  onAppSupport: _onAppSupport,
  onTermsPrivacy: _onTermsPrivacy,
  onViewDJProfile,

  // Layout
  maxWidth = '860px',
  className = '',
}: CrProfileCardProps) {
  // Track the original full image separately from the cropped avatar
  const [originalFullImage, setOriginalFullImage] = useState(fullProfileImage || null)

  // Update originalFullImage when props change (for profile switching)
  useEffect(() => {
    setOriginalFullImage(fullProfileImage || null)
  }, [fullProfileImage])

  const componentClasses = ['cr-profile-card', `cr-profile-card--${state}`, className]
    .filter(Boolean)
    .join(' ')

  const handleImageChange = (images: any) => {
    // When new images are provided, update both the avatar and store the full image
    if (images.fullImage) {
      setOriginalFullImage(images.fullImage)
    }
    if (onChange && images.croppedImage) {
      onChange('avatarSrc', images.croppedImage)
    }
  }

  const isEditing = state === 'editProfile' || state === 'editVolunteer'
  const showEditTabs = (isVolunteer || isDJ) && isEditing

  // Render signed out state
  if (state === 'signedOut') {
    return (
      <div className={componentClasses} style={{ maxWidth }}>
        <CrPageHeader
          eyebrowText={eyebrowText}
          title="Create Your CHIRP Account"
          showActionButton={false}
        />

        <section className="cr-profile-card__not-logged-in">
          <div className="cr-profile-card__not-logged-in-content">
            <p className="cr-profile-card__not-logged-in-description">
              Create a CHIRP Radio account to unlock all the features and benefits of our community.
            </p>

            <div className="cr-profile-card__not-logged-in-actions">
              <CrButton variant="text" color="default" size="medium" onClick={onLogin}>
                log in
              </CrButton>
              <CrButton variant="solid" color="secondary" size="medium" onClick={onSignUp}>
                sign up
              </CrButton>
            </div>

            <h3 className="cr-profile-card__benefits-title">Benefits of Creating an Account:</h3>
            <ul className="cr-profile-card__benefits-list">
              <li>Save your favorite songs from our live stream to your personal collection</li>
              <li>Make song requests directly to our DJs during their shows</li>
              <li>Access your saved tracks across web and mobile apps</li>
              <li>Save your information for store purchases and donations</li>
              <li>Sync your preferences and settings between devices</li>
              <li>Get personalized recommendations based on your listening history</li>
              <li>Receive updates about upcoming shows and events</li>
            </ul>
          </div>
        </section>
      </div>
    )
  }

  // Render view state (logged in)
  if (state === 'view') {
    return (
      <div className={componentClasses} style={{ maxWidth }}>
        <CrPageHeader
          eyebrowText={eyebrowText}
          title={title}
          showActionButton={showEditButton}
          actionButtonText="Edit"
          actionButtonIcon={<PiPencilSimple />}
          onActionClick={onEditClick}
        />

        <section className="cr-profile-card__profile">
          {/* Header section: Avatar + Name + DJ Button (stays together) */}
          <div className="cr-profile-card__header-section">
            <div className="cr-profile-card__avatar-container">
              <div className="cr-profile-card__avatar">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={avatarAlt} className="cr-profile-card__avatar-image" />
                ) : (
                  <div className="cr-profile-card__avatar-placeholder">
                    <svg className="cr-profile-card__avatar-icon" viewBox="0 0 100 100">
                      <circle cx="50" cy="35" r="18" />
                      <path d="M 20 85 Q 20 60, 50 60 T 80 85" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            <div className="cr-profile-card__name-section">
              <h2 className="cr-profile-card__name cr-title-lg">
                {firstName} {lastName}
              </h2>

              {isDJ && onViewDJProfile && (
                <div className="mt-2">
                  <CrButton
                    variant="outline"
                    size="small"
                    color="secondary"
                    rightIcon={<PiUser />}
                    onClick={onViewDJProfile}
                  >
                    View DJ Profile
                  </CrButton>
                </div>
              )}
            </div>
          </div>

          {/* Details section */}
          <div className="cr-profile-card__profile-info">
            <div className="cr-profile-card__details">
              {isDJ && djId && (
                <div className="cr-profile-card__detail-item">
                  <span className="cr-profile-card__detail-label">DJ ID:</span>
                  <span className="cr-profile-card__detail-value">{djId}</span>
                </div>
              )}

              {isDJ && djName && (
                <div className="cr-profile-card__detail-item">
                  <span className="cr-profile-card__detail-label">DJ Name:</span>
                  <span className="cr-profile-card__detail-value">{djName}</span>
                </div>
              )}

              {isDJ && showName && (
                <div className="cr-profile-card__detail-item">
                  <span className="cr-profile-card__detail-label">Show Name:</span>
                  <span className="cr-profile-card__detail-value">{showName}</span>
                </div>
              )}

              {isDJ && showTime && (
                <div className="cr-profile-card__detail-item">
                  <span className="cr-profile-card__detail-label">DJ Schedule:</span>
                  <span className="cr-profile-card__detail-value">{showTime}</span>
                </div>
              )}

              <div className="cr-profile-card__detail-item">
                <span className="cr-profile-card__detail-label">Location:</span>
                <span className="cr-profile-card__detail-value">{location}</span>
              </div>

              <div className="cr-profile-card__detail-item">
                <span className="cr-profile-card__detail-label">Email:</span>
                <div className="cr-profile-card__detail-value-with-action">
                  <span className="cr-profile-card__detail-value">{email}</span>
                  <CrButton variant="outline" color="default" size="small" onClick={onSignOut}>
                    sign out
                  </CrButton>
                </div>
              </div>

              <div className="cr-profile-card__detail-item">
                <span className="cr-profile-card__detail-label">Member Since:</span>
                <span className="cr-profile-card__detail-value">{memberSince}</span>
              </div>
            </div>
          </div>
        </section>

        {showPermissions && (
          <section className="cr-profile-card__permissions">
            <div className="cr-profile-card__permissions-label">Permissions:</div>
            <div className="cr-profile-card__permissions-chips">
              {permissions.map((permission, index) => (
                <CrChip key={index} variant="light" size="small">
                  {permission}
                </CrChip>
              ))}
            </div>
          </section>
        )}

        {socialLinks && socialLinks.length > 0 && (
          <section className="cr-profile-card__social-section">
            <div className="cr-profile-card__social-columns">
              <div className="cr-profile-card__social-column">
                {socialLinks.slice(0, Math.ceil(socialLinks.length / 2)).map((link, index) => (
                  <div key={`${link.platform}-${index}`} className="cr-profile-card__social-item">
                    <CrSocialIcon platform={link.platform} size={40} url={link.url} />
                    <a
                      href={`https://${link.url}`}
                      className="cr-profile-card__social-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.url}
                    </a>
                  </div>
                ))}
              </div>
              <div className="cr-profile-card__social-column">
                {socialLinks.slice(Math.ceil(socialLinks.length / 2)).map((link, index) => (
                  <div key={`${link.platform}-${index}`} className="cr-profile-card__social-item">
                    <CrSocialIcon platform={link.platform} size={40} url={link.url} />
                    <a
                      href={`https://${link.url}`}
                      className="cr-profile-card__social-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.url}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Account Settings Section */}
        <section className="cr-profile-card__account-settings">
          <CrPageHeader
            eyebrowText="Your Account"
            title="Account Settings"
            titleTag="h2"
            titleSize="lg"
            showEyebrow={false}
            showActionButton={false}
          />

          <div className="cr-profile-card__settings">
            <CrSettingsToggles
              streamingQuality={streamingQuality}
              onStreamingQualityChange={onStreamingQualityChange}
              pushNotifications={pushNotifications}
              onPushNotificationsChange={onPushNotificationsChange}
              darkMode={darkMode}
              onDarkModeChange={onDarkModeChange}
            />
          </div>
        </section>
      </div>
    )
  }

  // Render edit states using extracted form components
  return (
    <div className={componentClasses} style={{ maxWidth }}>
      <CrPageHeader eyebrowText={eyebrowText} title={title} showActionButton={false} />

      {/* Edit Tabs - only show if user is volunteer/DJ and in edit mode */}
      {showEditTabs && (
        <div className="cr-profile-card__edit-tabs">
          <button
            className={`cr-profile-card__edit-tab ${state === 'editProfile' ? 'cr-profile-card__edit-tab--active' : ''}`}
            onClick={() => onStateChange && onStateChange('editProfile')}
          >
            <PiUser size={16} />
            Profile Details
          </button>
          <button
            className={`cr-profile-card__edit-tab ${state === 'editVolunteer' ? 'cr-profile-card__edit-tab--active' : ''}`}
            onClick={() => onStateChange && onStateChange('editVolunteer')}
          >
            <PiHeart size={16} />
            Volunteer Details
          </button>
        </div>
      )}

      {/* Render appropriate form component */}
      {state === 'editProfile' && (
        <CrProfileEditForm
          firstName={firstName}
          lastName={lastName}
          email={email}
          avatarSrc={avatarSrc}
          socialLinks={socialLinks}
          isDJ={isDJ}
          isVolunteer={isVolunteer}
          formData={formData}
          onChange={onChange}
          onImageChange={handleImageChange}
          onSave={onSave}
          onCancel={onCancel}
          onForgotPassword={onForgotPassword}
          originalFullImage={originalFullImage || undefined}
        />
      )}

      {state === 'editVolunteer' && (
        <CrVolunteerEditForm
          formData={formData}
          onChange={onChange}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}
