// src/pages/LandingPage.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PiCalendarDots, PiReadCvLogo, PiVinylRecord } from 'react-icons/pi'
import CrAnnouncement from '../stories/CrAnnouncement'
import CrCurrentDjCard from '../stories/CrCurrentDjCard'
import CrAdSpace from '../stories/CrAdSpace'
import CrDjOverview from '../stories/CrDjOverview'
import CrPageHeader from '../stories/CrPageHeader'
import CrCard from '../stories/CrCard'
import HeroCarousel from '../components/HeroCarousel'
import CrRecentlyPlayed from '../stories/CrRecentlyPlayed'
import {
  useFeaturedAnnouncement,
  useAnnouncements,
  useEvents,
  useArticles,
  useCurrentShow,
  useRegularDJs,
  useSiteSettings,
  useMembers,
  useShowSchedules,
} from '../hooks/useData'
import { useNowPlaying } from '../contexts/NowPlayingContext'
import { useRecentTracksPlayed } from '../hooks/useTracksPlayed'
import {
  getEventImageUrl,
  getEventCategoryName,
  getEventVenueName,
  getEventAgeRestriction,
} from '../utils/typeHelpers'
import type { Member } from '../types/cms'
import { useAuth } from '../hooks/useAuth'
import { useLoginRequired } from '../hooks/useLoginRequired'
import { downloadDJShowCalendar } from '../utils/calendar'
import { formatShowTime, prepareShowTimes } from '../utils/formatShowTime'
import { useNotification } from '../contexts/NotificationContext'
import LoginRequiredModal from '../stories/CrLoginRequiredModal'

const LandingPage: React.FC = () => {
  const navigate = useNavigate()
  const { data: siteSettings } = useSiteSettings()
  const { data: featuredAnnouncement } = useFeaturedAnnouncement()
  const { data: announcements } = useAnnouncements()
  const { data: events } = useEvents()
  const { data: articles } = useArticles()
  const { data: currentShow } = useCurrentShow()
  const { data: allRegularDJs } = useRegularDJs()
  const { user: loggedInUser, updateFavoriteDJs } = useAuth()
  const { requireLogin, showLoginModal, handleLogin, handleSignUp, closeModal } = useLoginRequired()
  const { showToast } = useNotification()
  const { data: members, loading: membersLoading } = useMembers()
  const { data: showSchedules } = useShowSchedules()
  const { currentData: nowPlayingData } = useNowPlaying()
  const { data: recentTracks } = useRecentTracksPlayed(6)

  // Transform tracks to add timeAgo field
  const playlistTracks = useMemo(() => {
    return recentTracks.map((track) => ({
      ...track,
      timeAgo: new Date(track.playedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
      }),
    }))
  }, [recentTracks])

  // Smart DJ check trigger - only updates at strategic times when DJ might change
  const [djCheckTrigger, setDjCheckTrigger] = useState(Date.now())

  useEffect(() => {
    const calculateNextDjCheck = (): number => {
      const now = new Date()
      const minutes = now.getMinutes()
      const seconds = now.getSeconds()

      // If we're in the first 5 minutes of the hour, check every minute
      if (minutes < 5) {
        // Wait until the next minute
        return (60 - seconds) * 1000
      }

      // If we're before :30, wait until :30
      if (minutes < 30) {
        const minutesUntil30 = 30 - minutes
        return (minutesUntil30 * 60 - seconds) * 1000
      }

      // If we're after :30, wait until the next hour
      const minutesUntilNextHour = 60 - minutes
      return (minutesUntilNextHour * 60 - seconds) * 1000
    }

    const scheduleNextCheck = () => {
      const delay = calculateNextDjCheck()
      console.log(`[DJ Check] Next DJ check in ${Math.round(delay / 1000)}s`)

      const timeoutId = setTimeout(() => {
        console.log('[DJ Check] Triggering DJ recalculation')
        setDjCheckTrigger(Date.now())
        scheduleNextCheck() // Schedule the next check
      }, delay)

      return timeoutId
    }

    const timeoutId = scheduleNextCheck()
    return () => clearTimeout(timeoutId)
  }, [])

  console.log(
    '[LandingPage] Members loading state:',
    membersLoading,
    'Members count:',
    members?.length
  )

  // Find currently scheduled show based on day/time
  const currentSchedule = useMemo(() => {
    if (!showSchedules || showSchedules.length === 0) {
      console.log('[currentSchedule] No show schedules')
      return null
    }

    const now = new Date()
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const currentDay = dayNames[now.getDay()]
    const currentTime = now.getHours() * 60 + now.getMinutes()

    // Find schedule for current day and time
    const schedule = showSchedules.find((schedule) => {
      if (schedule.dayOfWeek.toLowerCase() !== currentDay) return false

      // Parse start and end times (handles both "6:00 AM" and ISO date strings)
      const parseTime = (timeStr: string): number => {
        // Try ISO date format first
        const date = new Date(timeStr)
        if (!isNaN(date.getTime())) {
          return date.getHours() * 60 + date.getMinutes()
        }

        // Fall back to "6:00 AM" format
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (!match) return 0

        let hours = parseInt(match[1])
        const minutes = parseInt(match[2])
        const period = match[3].toUpperCase()

        if (period === 'PM' && hours !== 12) hours += 12
        if (period === 'AM' && hours === 12) hours = 0

        return hours * 60 + minutes
      }

      const scheduleStart = parseTime(schedule.startTime)
      const scheduleEnd = parseTime(schedule.endTime)

      // Handle overnight shows (end time < start time)
      if (scheduleEnd < scheduleStart) {
        return currentTime >= scheduleStart || currentTime < scheduleEnd
      }

      return currentTime >= scheduleStart && currentTime < scheduleEnd
    })

    return schedule || null
  }, [showSchedules])

  // Extract scheduled DJ from current schedule
  const scheduledDJ = useMemo(() => {
    if (!currentSchedule) return null
    return typeof currentSchedule.dj === 'object' ? (currentSchedule.dj as Member) : null
  }, [currentSchedule])

  // Find current DJ member data by matching DJ name from now playing API
  // Only recalculates at strategic times (on the hour, first 5 mins, and :30)
  const currentDJMember = useMemo(() => {
    console.log('[DJ Matching] nowPlayingData?.dj:', nowPlayingData?.dj)
    console.log('[DJ Matching] members count:', members?.length)
    console.log(
      '[DJ Matching] scheduledDJ:',
      scheduledDJ
        ? {
            id: scheduledDJ.id,
            djName: scheduledDJ.djName,
            firstName: scheduledDJ.firstName,
          }
        : null
    )

    // Log all members with their DJ names for debugging
    if (members) {
      const djNames = members.filter((m) => m.djName).map((m) => ({ id: m.id, djName: m.djName }))
      console.log('[DJ Matching] All members DJ names:', djNames)
      console.log('[DJ Matching] Total members:', members.length, 'With DJ names:', djNames.length)

      // Check if Anna Flores is in the array
      const annaFlores = members.find(
        (m) =>
          m.firstName?.toLowerCase().includes('anna') ||
          m.lastName?.toLowerCase().includes('flores') ||
          m.djName?.toLowerCase().includes('anna') ||
          m.djName?.toLowerCase().includes('flores')
      )
      console.log(
        '[DJ Matching] Anna Flores in members?',
        annaFlores
          ? {
              id: annaFlores.id,
              firstName: annaFlores.firstName,
              lastName: annaFlores.lastName,
              djName: annaFlores.djName,
              roles: annaFlores.roles,
            }
          : 'NOT FOUND'
      )
    }

    if (!nowPlayingData?.dj || !members) {
      console.log('[DJ Matching] Missing data, using scheduledDJ')
      return scheduledDJ
    }

    const djName = nowPlayingData.dj.toLowerCase().trim()
    console.log('[DJ Matching] Looking for:', djName)

    // Look for exact match first
    const exactMatch = members.find((member) => {
      const memberDjName = member.djName?.toLowerCase().trim()
      const isMatch = memberDjName === djName
      if (
        memberDjName &&
        (isMatch || memberDjName.includes('anna') || memberDjName.includes('flores'))
      ) {
        console.log('[DJ Matching] Checking exact:', {
          memberDjName,
          searchingFor: djName,
          isMatch,
          memberId: member.id,
        })
      }
      return isMatch
    })
    if (exactMatch) {
      console.log('[DJ Matching] ✅ Found exact match:', exactMatch.djName, 'ID:', exactMatch.id)
      return exactMatch
    }

    // Try partial match (DJ name might be part of a longer name)
    // Only check if member.djName exists and is not empty
    const partialMatch = members.find((member) => {
      const memberDjName = member.djName?.toLowerCase().trim()
      if (!memberDjName) return false // Skip members without DJ names

      return memberDjName.includes(djName) || djName.includes(memberDjName)
    })

    if (partialMatch) {
      console.log(
        '[DJ Matching] ✅ Found partial match:',
        partialMatch.djName,
        'ID:',
        partialMatch.id
      )
    } else {
      console.log('[DJ Matching] ❌ No match found, using scheduledDJ')
    }

    // Fall back to scheduled DJ if no match found
    return partialMatch || scheduledDJ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [djCheckTrigger, nowPlayingData?.dj, members, scheduledDJ])

  // Get 10 random Regular DJs (without repeating)
  const randomDJs = useMemo(() => {
    if (!allRegularDJs || allRegularDJs.length === 0) return []

    const shuffled = [...allRegularDJs].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 10)
  }, [allRegularDJs])

  // Handle favoriting the current DJ
  const handleFavoriteCurrentDJ = () => {
    console.log('[LandingPage] handleFavoriteCurrentDJ called')
    console.log('[LandingPage] currentDJMember:', currentDJMember)
    console.log(
      '[LandingPage] loggedInUser:',
      loggedInUser
        ? {
            id: loggedInUser.id,
            email: loggedInUser.email,
            favoriteDJs: loggedInUser.favoriteDJs,
          }
        : 'null'
    )

    if (!currentDJMember?.id) {
      console.error('[LandingPage] No currentDJMember ID')
      return
    }

    requireLogin(() => {
      const isFavorited = loggedInUser?.favoriteDJs?.includes(String(currentDJMember.id))
      const djName = currentDJMember.djName || nowPlayingData?.dj || 'this DJ'

      console.log('[LandingPage] Calling updateFavoriteDJs:', {
        userId: loggedInUser?.id,
        djId: String(currentDJMember.id),
        newFavoriteStatus: !isFavorited,
      })

      updateFavoriteDJs(String(currentDJMember.id), !isFavorited)

      showToast({
        message: isFavorited ? `Unfavorited ${djName}` : `Favorited ${djName}`,
        type: 'success',
        duration: 3000,
      })
    })
  }

  // Add landing-page class to body on mount, remove on unmount
  useEffect(() => {
    document.body.classList.add('landing-page')
    return () => {
      document.body.classList.remove('landing-page')
    }
  }, [])

  // Get configured announcements and advertisement from Site Settings
  const topAnnouncementId =
    typeof siteSettings?.topAnnouncement === 'string'
      ? siteSettings.topAnnouncement
      : typeof siteSettings?.topAnnouncement === 'object' &&
          siteSettings.topAnnouncement !== null &&
          'id' in siteSettings.topAnnouncement
        ? siteSettings.topAnnouncement.id
        : undefined
  const sidebarAnnouncementId =
    typeof siteSettings?.sidebarAnnouncement === 'string'
      ? siteSettings.sidebarAnnouncement
      : typeof siteSettings?.sidebarAnnouncement === 'object' &&
          siteSettings.sidebarAnnouncement !== null &&
          'id' in siteSettings.sidebarAnnouncement
        ? siteSettings.sidebarAnnouncement.id
        : undefined

  // Get announcements by ID or fallback to first active
  const displayTopAnnouncement =
    (siteSettings?.showTopAnnouncement !== false &&
      (topAnnouncementId
        ? announcements?.find((a) => a.id === topAnnouncementId)
        : featuredAnnouncement)) ||
    null

  const displaySidebarAnnouncement = sidebarAnnouncementId
    ? announcements?.find((a) => a.id === sidebarAnnouncementId)
    : announcements?.find((a) => a.isActive && !a.featuredOnLanding)

  const sidebarAdvertisement = siteSettings?.sidebarAdvertisement
  // Transform events data for hero carousel (take first 3 featured events)
  const heroSlides =
    events
      ?.filter((e) => e.featured)
      .slice(0, 3)
      .map((event) => ({
        backgroundImage: getEventImageUrl(event) || '',
        imageCaption: '',
        preheader: getEventCategoryName(event),
        title: event.title,
        dateTime: new Date(event.date).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
        venue: getEventVenueName(event),
        ageRestriction: getEventAgeRestriction(event),
        contentSummary: event.excerpt,
        bannerButtonText: event.isFree ? 'Learn More' : 'Get Tickets',
        shareButtonText: 'Share',
        slug: event.slug,
      })) || []

  return (
    <div className="landing-page">
      {/* Top Announcement */}
      {displayTopAnnouncement && (
        <section className="page-section">
          <div className="page-container">
            <CrAnnouncement
              variant={displayTopAnnouncement.variant}
              textureBackground={displayTopAnnouncement.textureBackground}
              headlineText={displayTopAnnouncement.headlineText}
              bodyText={
                typeof displayTopAnnouncement.bodyText === 'string'
                  ? displayTopAnnouncement.bodyText
                  : undefined
              }
              showLink={displayTopAnnouncement.showLink}
              linkText={displayTopAnnouncement.linkText}
              linkUrl={displayTopAnnouncement.linkUrl}
              buttonCount={displayTopAnnouncement.buttonCount}
              button1Text={displayTopAnnouncement.button1Text}
              button1Icon={displayTopAnnouncement.button1Icon}
              button2Text={displayTopAnnouncement.button2Text}
              button2Icon={displayTopAnnouncement.button2Icon}
              currentAmount={displayTopAnnouncement.currentAmount}
              targetAmount={displayTopAnnouncement.targetAmount}
            />
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <section className="page-layout-main-sidebar">
        <div className="page-layout-main-sidebar__main">
          <HeroCarousel slides={heroSlides} />
        </div>

        <div className="page-layout-main-sidebar__sidebar">
          {currentShow &&
            nowPlayingData &&
            (() => {
              // Extract profile image from CMS Member
              const djImage =
                typeof currentDJMember?.profileImage === 'string'
                  ? currentDJMember.profileImage
                  : typeof currentDJMember?.profileImage === 'object' &&
                      currentDJMember.profileImage !== null &&
                      'url' in currentDJMember.profileImage
                    ? currentDJMember.profileImage.url
                    : undefined // Return undefined if no profile image, let component handle fallback

              const descriptionRaw =
                currentDJMember?.djExcerpt || currentDJMember?.djBio || currentShow.description

              // Convert LexicalEditorState to string if needed
              const description = typeof descriptionRaw === 'string' ? descriptionRaw : undefined

              // Create slug from DJ name for member profile link
              const djSlug =
                currentDJMember?.djName || currentDJMember?.firstName
                  ? (currentDJMember.djName || currentDJMember.firstName || '')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                  : null

              console.log('[CrCurrentDjCard] Rendering with:', {
                currentDJMember: currentDJMember
                  ? {
                      id: currentDJMember.id,
                      djName: currentDJMember.djName,
                      djExcerpt: currentDJMember.djExcerpt,
                      djBio: currentDJMember.djBio,
                      profileImage: currentDJMember.profileImage,
                    }
                  : null,
                djImage,
                description,
                djSlug,
              })

              // Only render if we have a DJ image to prevent showing placeholder
              if (!djImage) {
                return null
              }

              return (
                <CrCurrentDjCard
                  djName={nowPlayingData.dj || currentShow.djName}
                  showName={nowPlayingData.show || currentShow.showName}
                  isOnAir={true}
                  djImage={djImage}
                  description={description}
                  onRequestClick={() => navigate('/request-song')}
                  onMoreClick={djSlug ? () => navigate(`/djs/${djSlug}`) : undefined}
                  onFavoriteClick={handleFavoriteCurrentDJ}
                  isFavorite={
                    currentDJMember?.id
                      ? loggedInUser?.favoriteDJs?.includes(String(currentDJMember.id))
                      : false
                  }
                />
              )
            })()}

          {displaySidebarAnnouncement && (
            <CrAnnouncement
              variant={displaySidebarAnnouncement.variant}
              widthVariant="third"
              textureBackground={displaySidebarAnnouncement.textureBackground}
              headlineText={displaySidebarAnnouncement.headlineText}
              bodyText={
                typeof displaySidebarAnnouncement.bodyText === 'string'
                  ? displaySidebarAnnouncement.bodyText
                  : undefined
              }
              showLink={displaySidebarAnnouncement.showLink}
              linkText={displaySidebarAnnouncement.linkText}
              linkUrl={displaySidebarAnnouncement.linkUrl}
              buttonCount={displaySidebarAnnouncement.buttonCount}
              button1Text={displaySidebarAnnouncement.button1Text}
              button1Icon={displaySidebarAnnouncement.button1Icon}
              button2Text={displaySidebarAnnouncement.button2Text}
              button2Icon={displaySidebarAnnouncement.button2Icon}
              currentAmount={displaySidebarAnnouncement.currentAmount}
              targetAmount={displaySidebarAnnouncement.targetAmount}
            />
          )}

          {sidebarAdvertisement && (
            <CrAdSpace
              size={sidebarAdvertisement.size || 'mobile-banner'}
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
      </section>

      {/* Recently Played Section */}
      <section className="page-section">
        <CrRecentlyPlayed
          tracks={playlistTracks}
          djName={nowPlayingData?.dj || scheduledDJ?.djName || currentShow?.djName}
          showName={scheduledDJ?.showName || currentShow?.showName}
          startTime={(() => {
            // Get current hour in Chicago time
            const now = new Date()
            const chicagoTime = new Date(
              now.toLocaleString('en-US', { timeZone: 'America/Chicago' })
            )
            const currentHour = chicagoTime.getHours()

            // Format start time (current hour)
            if (currentHour === 0) return '12m'
            if (currentHour === 12) return '12n'
            if (currentHour < 12) return `${currentHour}:00am`
            return `${currentHour - 12}:00pm`
          })()}
          endTime={(() => {
            // Get next hour in Chicago time
            const now = new Date()
            const chicagoTime = new Date(
              now.toLocaleString('en-US', { timeZone: 'America/Chicago' })
            )
            const nextHour = (chicagoTime.getHours() + 1) % 24

            // Format end time (next hour)
            if (nextHour === 0) return '12m'
            if (nextHour === 12) return '12n'
            if (nextHour < 12) return `${nextHour}:00am`
            return `${nextHour - 12}:00pm`
          })()}
          djProfileUrl={
            currentDJMember?.id
              ? `/djs/${currentDJMember.djName?.toLowerCase().replace(/\s+/g, '-')}`
              : currentShow?.djProfileUrl
          }
          onViewPlaylist={() => navigate('/playlist')}
        />
      </section>

      {/* Grid Section */}
      <section className="page-layout-3col">
        <div className="page-layout-3col__column page-layout-3col__column--container">
          <CrPageHeader
            key="events-header"
            showEyebrow={false}
            title="Events"
            actionButtonText="See More Events"
            actionButtonIcon={<PiCalendarDots />}
            onActionClick={() => navigate('/events')}
          />
          {events?.slice(0, 3).map((event, index) => (
            <CrCard
              key={event.slug || event.id || `event-${index}`}
              variant="narrow"
              textLayout="stacked"
              bannerHeight="tall"
              imageAspectRatio="16:9"
              backgroundImage={getEventImageUrl(event)}
              preheader={getEventCategoryName(event)}
              title={event.title}
              dateTime={new Date(event.date).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              venue={getEventVenueName(event)}
              ageRestriction={getEventAgeRestriction(event)}
              contentSummary={event.excerpt}
              onClick={() => navigate(`/events/${event.slug}`)}
            />
          ))}
        </div>

        <div className="page-layout-3col__column page-layout-3col__column--container page-layout-3col__column--bg page-layout-3col__column--articles">
          <CrPageHeader
            key="articles-header"
            showEyebrow={false}
            title="Articles"
            actionButtonText="View More Articles"
            actionButtonIcon={<PiReadCvLogo />}
            onActionClick={() => navigate('/articles')}
          />
          {articles?.slice(0, 6).map((article, index) => (
            <CrCard
              key={article.slug || article.id || `article-${index}`}
              variant="small"
              type="article"
              textLayout="stacked"
              bannerHeight="tall"
              imageAspectRatio="16:9"
              bannerBackgroundColor="textured"
              backgroundImage={
                typeof article.featuredImage === 'string'
                  ? article.featuredImage
                  : typeof article.featuredImage === 'object' &&
                      article.featuredImage !== null &&
                      'url' in article.featuredImage
                    ? article.featuredImage.url
                    : undefined
              }
              preheader={
                typeof article.category === 'string'
                  ? article.category
                  : typeof article.category === 'object' &&
                      article.category !== null &&
                      'name' in article.category
                    ? article.category.name
                    : undefined
              }
              title={article.title}
              contentSummary={article.excerpt}
              onClick={() => navigate(`/articles/${article.slug}`)}
            />
          ))}
        </div>

        <div className="page-layout-3col__column page-layout-3col__column--container page-layout-3col__column--large-gap">
          <CrPageHeader
            key="djs-header"
            showEyebrow={false}
            title="Our DJs"
            showActionButton={true}
            actionButtonText="Review the DJ Schedule"
            actionButtonIcon={<PiVinylRecord />}
            onActionClick={() => navigate('/schedule')}
          />
          <p className="landing-note">* All times displayed in Central Time</p>
          <div className="cr-dj-overview-wrapper">
            {randomDJs.map((dj, index) => (
              <CrDjOverview
                key={dj.slug || dj.id || `dj-${index}`}
                size="medium"
                djName={dj.djName}
                showTime={formatShowTime(dj.showTime)}
                showTimes={prepareShowTimes(dj.showTime, dj.djName, dj.showName, (_error) => {
                  showToast({
                    message: 'Unable to create calendar event. Please check the show time format.',
                    type: 'error',
                    duration: 5000,
                  })
                })}
                showContent={false}
                buttonText="Profile"
                imageSrc={dj.imageSrc}
                isFavorite={loggedInUser?.favoriteDJs?.includes(dj.id)}
                onMoreClick={() => navigate(`/djs/${dj.slug}`)}
                onAddToCalendarClick={() => {
                  try {
                    downloadDJShowCalendar({
                      djName: dj.djName,
                      showName: dj.showName,
                      showTime: dj.showTime,
                    })
                  } catch (_error) {
                    showToast({
                      message:
                        'Unable to create calendar event. Please check the show time format.',
                      type: 'error',
                      duration: 5000,
                    })
                  }
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <LoginRequiredModal
        isOpen={showLoginModal}
        onClose={closeModal}
        onLogin={handleLogin}
        onSignUp={handleSignUp}
      />
    </div>
  )
}

export default LandingPage
