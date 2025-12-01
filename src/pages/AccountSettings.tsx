// src/pages/AccountSettings.tsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { PiHandHeart, PiStorefront, PiDownloadSimple } from 'react-icons/pi'
import CrProfileCard from '../stories/CrProfileCard'
import CrTable from '../stories/CrTable'
import CrButton from '../stories/CrButton'
import CrModal from '../stories/CrModal'
import CrAppIconSelector from '../stories/CrAppIconSelector'
import { useAuth } from '../hooks/useAuth'
import { useNotification } from '../contexts/NotificationContext'
import { isDJ, isVolunteer } from '../types/user'
import { Capacitor } from '@capacitor/core'
import AppIconPlugin from '../plugins/AppIconPlugin'
import CrLoginRequiredModal from '../stories/CrLoginRequiredModal'
import CrForgotPasswordModal from '../stories/CrForgotPasswordModal'
import { emit } from '../utils/eventBus'
import { formatShowTime } from '../utils/formatShowTime'
import { updateInCMS } from '../utils/api'
import { fetchMemberById } from '../utils/cmsMembers'
import type { Member } from '../types/member'
import VersionNumber from '../components/VersionNumber'
import './AccountSettings.css'

export default function AccountSettings() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    isLoggedIn,
    user,
    login,
    signOut,
    signup,
    verifyPassword,
    requestEmailChange,
    verifyEmailChange,
    cancelEmailChange,
  } = useAuth()
  const { showToast } = useNotification()

  // State for profile edit mode
  const [profileState, setProfileState] = useState<
    'view' | 'editProfile' | 'editVolunteer' | 'signedOut'
  >('view')

  // Form data state for editing
  const [formData, setFormData] = useState<any>({})

  // Email change state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [pendingNewEmail, setPendingNewEmail] = useState<string>('')
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false)
  const [emailChangeError, setEmailChangeError] = useState<string>('')

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      console.log('[AccountSettings] User changed, updating formData:', {
        id: user.id,
        email: user.email,
        profileImage: user.profileImage,
      })

      // Convert socialLinks object to both array format AND individual platform fields
      const socialLinksArray: Array<{ platform: string; url: string }> = []
      const platformUrlFields: Record<string, string> = {}

      if (user.socialLinks && typeof user.socialLinks === 'object') {
        Object.entries(user.socialLinks).forEach(([platform, url]) => {
          if (url && url.trim() !== '') {
            socialLinksArray.push({ platform, url: url as string })
            platformUrlFields[`${platform}Url`] = url as string
          }
        })
      }

      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        location: user.location || 'Chicago, Illinois',
        email: user.email || '',
        avatarSrc: user.profileImage || '',
        fullProfileImage: user.fullProfileImage || '',
        profileImageOrientation: user.profileImageOrientation || 'square',
        djName: user.djName || '',
        showName: user.showName || '',
        showTime: user.showTime || '',
        djExcerpt: user.djExcerpt || '',
        djBio: user.djBio || '',
        djDonationLink: user.djDonationLink || '',
        primaryPhoneType: user.primaryPhoneType || 'mobile',
        primaryPhone: user.primaryPhone || '',
        secondaryPhoneType: user.secondaryPhoneType || '',
        secondaryPhone: user.secondaryPhone || '',
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        zipCode: user.zipCode || '',
        socialLinks: socialLinksArray,
        // Add individual platform URL fields
        ...platformUrlFields,
      })
    }
  }, [user, user?.id])

  // Get the appropriate storage based on login state
  const getStorage = useCallback(() => (isLoggedIn ? localStorage : sessionStorage), [isLoggedIn])

  // Load dark mode preference
  const [darkMode, setDarkMode] = useState<'light' | 'dark' | 'device'>(() => {
    const storage = getStorage()
    const saved = storage.getItem('chirp-dark-mode')
    if (saved === 'light' || saved === 'dark' || saved === 'device') {
      return saved
    }
    return 'light' // Default to light mode
  })

  // Load streaming quality preference
  const [streamingQuality, setStreamingQuality] = useState(() => {
    const storage = getStorage()
    const saved = storage.getItem('chirp-streaming-quality')
    return saved || '128'
  })

  // App icon state (only relevant for mobile app)
  const [currentAppIcon, setCurrentAppIcon] = useState(() => {
    const storage = getStorage()
    const saved = storage.getItem('chirp-app-icon')
    return saved || 'icon1'
  })

  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [loginModalMode, setLoginModalMode] = useState<'login' | 'signup'>('login')

  // Check if we're in /app routes and should show icon selector
  // Only show on iOS (Android requires complex activity alias setup)
  const isInAppRoutes = location.pathname.startsWith('/app')
  const showIconSelector = isInAppRoutes && Capacitor.getPlatform() === 'ios'

  // Fetch latest user data from CMS when component mounts to ensure preferences are up to date
  useEffect(() => {
    const refreshUserPreferences = async () => {
      if (isLoggedIn && user?.id) {
        // Skip CMS fetch for demo users (they don't exist in the database)
        if (user.id.startsWith('user-')) {
          console.log('[AccountSettings] Skipping CMS fetch for demo user:', user.id)
          return
        }

        console.log('[AccountSettings] Fetching latest user data from CMS for user:', user.id)
        try {
          const latestUser = await fetchMemberById(user.id)
          if (latestUser && latestUser.preferences?.darkMode) {
            console.log(
              '[AccountSettings] Loaded darkMode from CMS:',
              latestUser.preferences.darkMode
            )
            setDarkMode(latestUser.preferences.darkMode)
            const storage = getStorage()
            storage.setItem('chirp-dark-mode', latestUser.preferences.darkMode)
            // Also update localStorage user object
            localStorage.setItem('chirp-user', JSON.stringify(latestUser))
          }
        } catch (error) {
          console.error('[AccountSettings] Failed to fetch latest user data:', error)
        }
      }
    }

    refreshUserPreferences()
  }, [isLoggedIn, user?.id, getStorage])

  // Load user's dark mode preference when user changes
  useEffect(() => {
    if (user && user.preferences && user.preferences.darkMode) {
      setDarkMode(user.preferences.darkMode)
      const storage = getStorage()
      storage.setItem('chirp-dark-mode', user.preferences.darkMode)
    }
  }, [user, getStorage]) // Only when user changes

  // When login state changes, migrate settings and update profile state
  useEffect(() => {
    if (isLoggedIn) {
      // User just logged in - migrate session settings to localStorage
      const sessionDarkMode = sessionStorage.getItem('chirp-dark-mode')
      const sessionQuality = sessionStorage.getItem('chirp-streaming-quality')

      if (sessionDarkMode !== null) {
        localStorage.setItem('chirp-dark-mode', sessionDarkMode)
        sessionStorage.removeItem('chirp-dark-mode')
      }

      if (sessionQuality !== null) {
        localStorage.setItem('chirp-streaming-quality', sessionQuality)
        sessionStorage.removeItem('chirp-streaming-quality')
      }

      // Reload settings from localStorage
      const savedDarkMode = localStorage.getItem('chirp-dark-mode')
      if (savedDarkMode === 'light' || savedDarkMode === 'dark' || savedDarkMode === 'device') {
        setDarkMode(savedDarkMode)
      } else {
        setDarkMode('light')
      }
      setStreamingQuality(localStorage.getItem('chirp-streaming-quality') || '128')

      // Set profile to view mode
      setProfileState('view')
    } else {
      // User logged out - reset to light mode and default settings
      setDarkMode('light')
      sessionStorage.setItem('chirp-dark-mode', 'light')
      setStreamingQuality('128')
      sessionStorage.setItem('chirp-streaming-quality', '128')

      // Set profile to signed out state
      setProfileState('signedOut')
    }
  }, [isLoggedIn])

  // Dispatch event when dark mode changes (App.tsx will handle the theme application)
  useEffect(() => {
    emit('chirp-dark-mode-change', darkMode)
  }, [darkMode])

  // Background sync: Retry pending CMS updates when page loads or regains focus
  useEffect(() => {
    const attemptPendingSync = async () => {
      const pendingSyncStr = localStorage.getItem('chirp-profile-pending-sync')
      if (!pendingSyncStr) return

      try {
        const pendingSync = JSON.parse(pendingSyncStr)
        console.log('Attempting to sync pending profile changes to CMS...')

        await updateInCMS<Member>('listeners', pendingSync.userId, pendingSync.data)

        console.log('✓ Pending profile changes synced to CMS successfully')
        localStorage.removeItem('chirp-profile-pending-sync')
      } catch (error) {
        console.warn('CMS still unavailable, will retry later:', error)
        // Keep the pending sync flag for next attempt
      }
    }

    // Attempt sync on mount
    attemptPendingSync()

    // Attempt sync when page regains focus (user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        attemptPendingSync()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const handleDarkModeChange = (mode: 'light' | 'dark' | 'device') => {
    setDarkMode(mode)
    const storage = getStorage()
    storage.setItem('chirp-dark-mode', mode)

    // Update user preferences if logged in
    if (user) {
      const updatedUser = {
        ...user,
        preferences: {
          ...user.preferences,
          darkMode: mode,
        },
      }
      localStorage.setItem('chirp-user', JSON.stringify(updatedUser))
    }
  }

  const handleStreamingQualityChange = (quality: string) => {
    console.log('🎵 [AccountSettings] Quality change requested:', quality)
    setStreamingQuality(quality)
    const storage = getStorage()
    storage.setItem('chirp-streaming-quality', quality)
    console.log(
      '🎵 [AccountSettings] Saved to storage:',
      storage.getItem('chirp-streaming-quality')
    )

    // Emit event via eventBus for same-window updates
    console.log('🎵 [AccountSettings] Emitting chirp-quality-change event')
    emit('chirp-quality-change', quality)
    console.log('🎵 [AccountSettings] Event emitted')
  }

  const handlePushNotificationsChange = (_checked: boolean) => {
    // TODO: Save notification preference
  }

  const handleIconChange = (iconId: string) => {
    // Update local state immediately for preview
    setCurrentAppIcon(iconId)
  }

  const handleApplyIcon = async (iconId: string) => {
    try {
      // Map iconId to iOS icon name (icon1 is default, others map to Icon2, Icon3, etc.)
      const iconName = iconId === 'icon1' ? null : `Icon${iconId.replace('icon', '')}`

      console.log('[handleApplyIcon] iconId:', iconId, 'iconName:', iconName)

      // Use native iOS API to change icon
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
        try {
          console.log('[handleApplyIcon] Calling AppIcon.change with:', {
            name: iconName,
            suppressNotification: false,
          })

          if (iconName === null) {
            // Reset to default icon
            await AppIconPlugin.reset({ suppressNotification: false })
          } else {
            // Change to alternate icon
            await AppIconPlugin.change({ name: iconName, suppressNotification: false })
          }

          console.log('[handleApplyIcon] Icon changed successfully')
        } catch (nativeError) {
          console.error('[handleApplyIcon] Native icon change failed:', nativeError)
          throw nativeError
        }
      }

      // Save preference
      const storage = getStorage()
      storage.setItem('chirp-app-icon', iconId)

      // Update user preferences if logged in
      if (user) {
        const updatedUser = {
          ...user,
          preferences: {
            ...user.preferences,
            appIcon: iconId,
          },
        }
        localStorage.setItem('chirp-user', JSON.stringify(updatedUser))
      }

      showToast({
        message: 'App icon updated successfully',
        type: 'success',
        duration: 3000,
      })
    } catch (error) {
      console.error('[handleApplyIcon] Error changing app icon:', error)
      showToast({
        message: 'Failed to change app icon. Please try again.',
        type: 'error',
        duration: 3000,
      })
      throw error
    }
  }

  const handleLoginClick = () => {
    setLoginModalMode('login')
    setShowLoginModal(true)
  }

  const handleSignUpClick = () => {
    setLoginModalMode('signup')
    setShowLoginModal(true)
  }

  const handleLogin = (email: string, _password: string) => {
    // For demo purposes, simulate login with a demo account
    login(email, email.split('@')[0])
    setShowLoginModal(false)
    showToast({
      message: 'Successfully logged in',
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

  const handleSignOut = () => {
    signOut()
    // Store toast flag for after redirect
    sessionStorage.setItem('chirp-show-signout-toast', 'true')
    // Redirect to appropriate landing page based on current route
    const isInAppRoutes = location.pathname.startsWith('/app')
    navigate(isInAppRoutes ? '/app' : '/')
  }

  const handleForgotPassword = () => {
    setShowForgotPasswordModal(true)
  }

  const handleShareApp = () => {
    // TODO: Open share dialog
  }

  const handleLikeAppStore = () => {
    // TODO: Open app store link
  }

  const handleAppSupport = () => {
    // TODO: Navigate to support page
  }

  const handleTermsPrivacy = () => {
    // TODO: Navigate to terms and privacy page
  }

  const handleViewDJProfile = () => {
    // Generate slug from DJ name
    const slug = user?.djName
      ? user.djName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      : 'dj-001'

    // Check if we're in mobile app routes
    const isInAppRoutes = location.pathname.startsWith('/app')

    if (isInAppRoutes) {
      // Open in browser for mobile app
      window.open(`https://chirpradio.org/djs/${slug}`, '_blank')
    } else {
      // Navigate in-app for web
      navigate(`/djs/${slug}`)
    }
  }

  const handleEditProfile = () => {
    setProfileState('editProfile')
  }

  const handleCancelEdit = () => {
    // Reset form data to original user data
    if (user) {
      // Convert socialLinks object to both array format AND individual platform fields
      const socialLinksArray: Array<{ platform: string; url: string }> = []
      const platformUrlFields: Record<string, string> = {}

      if (user.socialLinks && typeof user.socialLinks === 'object') {
        Object.entries(user.socialLinks).forEach(([platform, url]) => {
          if (url && url.trim() !== '') {
            socialLinksArray.push({ platform, url: url as string })
            platformUrlFields[`${platform}Url`] = url as string
          }
        })
      }

      setFormData({
        firstName:
          user.firstName || (typeof user.name === 'string' ? user.name.split(' ')[0] : '') || '',
        lastName:
          user.lastName || (typeof user.name === 'string' ? user.name.split(' ')[1] : '') || '',
        location: user.location || 'Chicago, Illinois',
        email: user.email || '',
        avatarSrc: user.profileImage || '',
        fullProfileImage: user.fullProfileImage || '',
        profileImageOrientation: user.profileImageOrientation || 'square',
        djName: user.djName || '',
        showName: user.showName || '',
        showTime: user.showTime || '',
        djExcerpt: user.djExcerpt || '',
        djBio: user.djBio || '',
        djDonationLink: user.djDonationLink || '',
        primaryPhoneType: user.primaryPhoneType || 'mobile',
        primaryPhone: user.primaryPhone || '',
        secondaryPhoneType: user.secondaryPhoneType || '',
        secondaryPhone: user.secondaryPhone || '',
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        zipCode: user.zipCode || '',
        socialLinks: socialLinksArray,
        // Add individual platform URL fields
        ...platformUrlFields,
      })
    }
    setProfileState('view')
  }

  const handleSaveProfile = async () => {
    // Check if email has changed
    const emailChanged = formData.email !== user?.email

    if (emailChanged) {
      // Trigger password confirmation flow
      setPendingNewEmail(formData.email)
      setShowPasswordModal(true)
      setEmailChangeError('')
      return
    }

    // If email hasn't changed, proceed with normal save
    try {
      const currentUser = JSON.parse(localStorage.getItem('chirp-user') || '{}')

      // Convert social links array back to object
      const socialLinksObj: any = {}
      if (formData.socialLinks && Array.isArray(formData.socialLinks)) {
        formData.socialLinks.forEach((link: any) => {
          if (link.platform && link.url) {
            socialLinksObj[link.platform] = link.url
          }
        })
      }

      // Prepare data for CMS update
      const memberUpdateData: Partial<Member> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        location: formData.location,
        profileImage: formData.avatarSrc,
        fullProfileImage: formData.fullProfileImage,
        profileImageOrientation: formData.profileImageOrientation,
        djName: formData.djName,
        showName: formData.showName,
        djExcerpt: formData.djExcerpt,
        djBio: formData.djBio,
        djDonationLink: formData.djDonationLink,
        primaryPhoneType: formData.primaryPhoneType,
        primaryPhone: formData.primaryPhone,
        secondaryPhoneType: formData.secondaryPhoneType,
        secondaryPhone: formData.secondaryPhone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        socialLinks: socialLinksObj,
      }

      // Update localStorage first (always works, even if CMS is down)
      const updatedUser = {
        ...currentUser,
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`,
        location: formData.location,
        profileImage: formData.avatarSrc,
        fullProfileImage: formData.fullProfileImage,
        profileImageOrientation: formData.profileImageOrientation,
        djName: formData.djName,
        showName: formData.showName,
        showTime: formData.showTime,
        djExcerpt: formData.djExcerpt,
        djBio: formData.djBio,
        djDonationLink: formData.djDonationLink,
        primaryPhoneType: formData.primaryPhoneType,
        primaryPhone: formData.primaryPhone,
        secondaryPhoneType: formData.secondaryPhoneType,
        secondaryPhone: formData.secondaryPhone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        socialLinks: socialLinksObj,
      }

      localStorage.setItem('chirp-user', JSON.stringify(updatedUser))

      // Try to sync to CMS in background (don't fail if CMS is down)
      if (currentUser.id) {
        updateInCMS<Member>('listeners', currentUser.id, memberUpdateData)
          .then(() => {
            console.log('Profile synced to CMS successfully')
            // Clear any pending sync flag
            localStorage.removeItem('chirp-profile-pending-sync')
          })
          .catch((error) => {
            console.warn('CMS sync failed, will retry later:', error)
            // Mark profile as needing sync
            localStorage.setItem(
              'chirp-profile-pending-sync',
              JSON.stringify({
                timestamp: Date.now(),
                data: memberUpdateData,
                userId: currentUser.id,
              })
            )
          })
      }

      // Emit event to refresh user context
      emit('chirp-user-profile-updated')

      showToast({
        message: 'Profile updated successfully',
        type: 'success',
        duration: 3000,
      })

      setProfileState('view')
    } catch (error) {
      console.error('Error saving profile:', error)
      showToast({
        message: 'Failed to save profile',
        type: 'error',
        duration: 3000,
      })
    }
  }

  const handleProfileChange = (field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handlePasswordConfirm = async () => {
    if (!verifyPassword(passwordInput)) {
      setEmailChangeError('Incorrect password. Please try again.')
      return
    }

    // Password verified, now save profile and initiate email change
    try {
      const currentUser = JSON.parse(localStorage.getItem('chirp-user') || '{}')

      // Convert social links array back to object
      const socialLinksObj: any = {}
      if (formData.socialLinks && Array.isArray(formData.socialLinks)) {
        formData.socialLinks.forEach((link: any) => {
          if (link.platform && link.url) {
            socialLinksObj[link.platform] = link.url
          }
        })
      }

      const updatedUser = {
        ...currentUser,
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`,
        location: formData.location,
        profileImage: formData.avatarSrc,
        fullProfileImage: formData.fullProfileImage,
        profileImageOrientation: formData.profileImageOrientation,
        djName: formData.djName,
        showName: formData.showName,
        showTime: formData.showTime,
        djExcerpt: formData.djExcerpt,
        djBio: formData.djBio,
        djDonationLink: formData.djDonationLink,
        primaryPhoneType: formData.primaryPhoneType,
        primaryPhone: formData.primaryPhone,
        secondaryPhoneType: formData.secondaryPhoneType,
        secondaryPhone: formData.secondaryPhone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        socialLinks: socialLinksObj,
      }

      localStorage.setItem('chirp-user', JSON.stringify(updatedUser))

      // Generate verification token (in real app, this would be done server-side)
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36)

      // Request email change
      requestEmailChange(pendingNewEmail, token)

      // Close modal and reset
      setShowPasswordModal(false)
      setPasswordInput('')
      setEmailChangeError('')
      setProfileState('view')

      // Show verification message
      showToast({
        message: 'Profile updated. Verification email sent to ' + pendingNewEmail,
        type: 'info',
        duration: 8000,
      })

      // Also show notification to old email (simulated)
      setTimeout(() => {
        showToast({
          message: `Security notice sent to ${user?.email}`,
          type: 'info',
          duration: 5000,
        })
      }, 1000)

      // For demo purposes, show verification button
      setTimeout(() => {
        showToast({
          message: 'Demo: Click "Verify Email Change" button in the banner to complete',
          type: 'warning',
          duration: 10000,
        })
      }, 2000)

      // Reload to show updated profile
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('Error saving profile:', error)
      setEmailChangeError('Failed to save profile. Please try again.')
    }
  }

  const handleCancelPasswordModal = () => {
    setShowPasswordModal(false)
    setPasswordInput('')
    setEmailChangeError('')
    setPendingNewEmail('')

    // Reset email in form data to original
    if (user?.email) {
      setFormData((prev: any) => ({
        ...prev,
        email: user.email,
      }))
    }
  }

  const handleVerifyEmailChange = () => {
    if (!user?.pendingEmailToken) return

    const success = verifyEmailChange(user.pendingEmailToken as string)

    if (success) {
      showToast({
        message: 'Email successfully updated!',
        type: 'success',
        duration: 5000,
      })

      // Update form data
      setFormData((prev: any) => ({
        ...prev,
        email: user.pendingEmail,
      }))

      // Reload to pick up changes
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } else {
      showToast({
        message: 'Verification failed or expired',
        type: 'error',
        duration: 5000,
      })
    }
  }

  const handleCancelEmailChange = () => {
    cancelEmailChange()

    // Reset email in form data to original
    if (user?.email) {
      setFormData((prev: any) => ({
        ...prev,
        email: user.email,
      }))
    }

    showToast({
      message: 'Email change cancelled',
      type: 'info',
      duration: 3000,
    })
  }

  const handleProfileStateChange = (state: string) => {
    setProfileState(state as 'view' | 'editProfile' | 'editVolunteer' | 'signedOut')
  }

  const handleMakeDonation = () => {
    navigate('/donate')
  }

  const handleVisitStore = () => {
    navigate('/shop')
  }

  // Donation history table configuration
  const donationColumns = [
    { key: 'date', title: 'Date', sortable: true, width: 'medium' },
    { key: 'type', title: 'Type', sortable: true, width: 'medium' },
    {
      key: 'amount',
      title: 'Amount',
      sortable: true,
      width: 'narrow',
      align: 'right' as const,
      render: (value: number) => `$${value}`,
    },
    {
      key: 'receipt',
      title: 'Receipt',
      sortable: false,
      width: 'narrow',
      align: 'center' as const,
      render: (_value: any, row: any) => (
        <CrButton
          variant="text"
          size="xsmall"
          color="default"
          leftIcon={<PiDownloadSimple />}
          onClick={() => console.log(`Downloading receipt for donation ${row.id}`)}
          aria-label={`Download receipt for ${row.amount} donation on ${row.date}`}
        >
          Receipt
        </CrButton>
      ),
    },
  ]

  // Purchase history table configuration
  const purchaseColumns = [
    { key: 'date', title: 'Date', sortable: true, width: 'medium' },
    { key: 'item', title: 'Item', sortable: true, width: 'wide' },
    {
      key: 'amount',
      title: 'Price',
      sortable: true,
      width: 'medium',
      align: 'right' as const,
      render: (value: number) => (typeof value === 'number' ? `$${value}` : value),
    },
  ]

  // Convert user social links to CrProfileCard format (filter out empty URLs)
  const socialLinksArray = user?.socialLinks
    ? Object.entries(user.socialLinks)
        .filter(([_, url]) => url && url.trim() !== '')
        .map(([platform, url]) => ({
          platform,
          url: url as string,
        }))
    : []

  // Format member since date to "Month Day, Year" format
  const formatMemberSince = (dateString?: string) => {
    if (!dateString) return undefined
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Use page-container for logged out state (better mobile padding)
  const containerClass = !isLoggedIn ? 'page-container' : 'account-settings-page'

  return (
    <div className={containerClass}>
      {/* Password Confirmation Modal */}
      {showPasswordModal ? (
        <CrModal
          isOpen={showPasswordModal}
          title="Confirm Password"
          size="small"
          onClose={handleCancelPasswordModal}
          scrimOnClick={handleCancelPasswordModal}
        >
          <div className="cr-modal__body">
            <div className="cr-modal-form">
              <p className="cr-modal-form__description">
                To change your email address, please confirm your password.
              </p>

              <div className="email-change-info">
                <div className="email-change-info__row">
                  <strong>Current:</strong> {user?.email}
                </div>
                <div className="email-change-info__row">
                  <strong>New:</strong> {pendingNewEmail}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password-input" className="form-label">
                  Password
                </label>
                <input
                  id="password-input"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePasswordConfirm()
                    } else if (e.key === 'Escape') {
                      handleCancelPasswordModal()
                    }
                  }}
                  placeholder="Enter your password"
                  className="form-input"
                  autoFocus
                />
                {emailChangeError && <p className="form-error">{emailChangeError}</p>}
              </div>

              <div className="cr-modal__actions cr-modal__actions--space-between cr-modal__actions--gap">
                <CrButton variant="text" color="default" onClick={handleCancelPasswordModal}>
                  Cancel
                </CrButton>
                <CrButton variant="filled" color="primary" onClick={handlePasswordConfirm}>
                  Confirm
                </CrButton>
              </div>
            </div>
          </div>
        </CrModal>
      ) : null}

      {/* Email Verification Pending Banner */}
      {user?.pendingEmail ? (
        <div className="email-verification-banner">
          <div className="email-verification-banner__content">
            <p>
              <strong>Email verification pending:</strong> We've sent a verification link to{' '}
              <strong>{String(user.pendingEmail)}</strong>. Your email won't change until you
              verify.
            </p>
            <div className="email-verification-banner__actions">
              <CrButton
                variant="filled"
                color="primary"
                size="small"
                onClick={handleVerifyEmailChange}
              >
                Verify Email Change (Demo)
              </CrButton>
              <CrButton
                variant="text"
                color="default"
                size="small"
                onClick={handleCancelEmailChange}
              >
                Cancel Change
              </CrButton>
            </div>
          </div>
        </div>
      ) : null}

      {isLoggedIn ? (
        <div className="page-layout-main-sidebar">
          <div className="page-layout-main-sidebar__main">
            <CrProfileCard
              state={profileState}
              eyebrowText="YOUR ACCOUNT"
              title="Your Profile"
              showEditButton={isLoggedIn}
              onEditClick={handleEditProfile}
              firstName={formData.firstName || user?.firstName || 'John'}
              lastName={formData.lastName || user?.lastName || 'Dough'}
              location={formData.location || user?.location || 'Chicago, Illinois'}
              email={formData.email || user?.email || 'account@gmail.com'}
              memberSince={formatMemberSince(user?.memberSince)}
              avatarSrc={formData.avatarSrc || user?.profileImage}
              socialLinks={formData.socialLinks || socialLinksArray}
              permissions={user?.roles || []}
              showPermissions={isVolunteer(user)}
              isVolunteer={isVolunteer(user) || isDJ(user)}
              isDJ={isDJ(user)}
              djId={user?.djId}
              djName={user?.djName}
              showName={user?.showName}
              showTime={formatShowTime(user?.showTime)}
              onStateChange={handleProfileStateChange}
              onSave={handleSaveProfile}
              onCancel={handleCancelEdit}
              onChange={handleProfileChange}
              formData={formData}
              streamingQuality={streamingQuality}
              onStreamingQualityChange={handleStreamingQualityChange}
              pushNotifications={false}
              onPushNotificationsChange={handlePushNotificationsChange}
              darkMode={darkMode}
              onDarkModeChange={handleDarkModeChange}
              onLogin={handleLoginClick}
              onSignOut={handleSignOut}
              onSignUp={handleSignUpClick}
              onForgotPassword={handleForgotPassword}
              onShareApp={handleShareApp}
              onLikeAppStore={handleLikeAppStore}
              onAppSupport={handleAppSupport}
              onTermsPrivacy={handleTermsPrivacy}
              onViewDJProfile={handleViewDJProfile}
            />

            {/* App Icon Selector - Only shown in /app routes on iOS 10.3+ and when logged in */}
            {showIconSelector && isLoggedIn && (
              <CrAppIconSelector
                currentIcon={currentAppIcon}
                onIconChange={handleIconChange}
                onApply={handleApplyIcon}
              />
            )}
          </div>

          {isLoggedIn && (
            <div
              className={`page-layout-main-sidebar__sidebar account-settings-page__sidebar account-settings-page__history-tables ${profileState === 'editProfile' || profileState === 'editVolunteer' ? 'account-settings-page__history-tables--hidden-mobile' : ''}`}
            >
              <CrTable
                tableTitle="Donation History"
                columns={donationColumns}
                data={user?.donationHistory || []}
                sortable={true}
                variant="compact"
                tableTitleLevel={2}
                tableTitleSize="lg"
                showActionButton={true}
                actionButtonText="Make a Donation"
                actionButtonIcon={<PiHandHeart />}
                actionButtonSize="small"
                onActionClick={handleMakeDonation}
              />

              <CrTable
                tableTitle="Purchase History"
                columns={purchaseColumns}
                data={user?.purchaseHistory || []}
                sortable={true}
                variant="compact"
                tableTitleLevel={2}
                tableTitleSize="lg"
                showActionButton={true}
                actionButtonText="Visit Store"
                actionButtonIcon={<PiStorefront />}
                actionButtonSize="small"
                onActionClick={handleVisitStore}
              />
            </div>
          )}
        </div>
      ) : (
        <CrProfileCard
          state={profileState}
          eyebrowText="YOUR ACCOUNT"
          title="Your Profile"
          showEditButton={false}
          streamingQuality={streamingQuality}
          onStreamingQualityChange={handleStreamingQualityChange}
          pushNotifications={false}
          onPushNotificationsChange={handlePushNotificationsChange}
          darkMode={darkMode}
          onDarkModeChange={handleDarkModeChange}
          onLogin={handleLoginClick}
          onSignOut={handleSignOut}
          onSignUp={handleSignUpClick}
          onForgotPassword={handleForgotPassword}
          onShareApp={handleShareApp}
          onLikeAppStore={handleLikeAppStore}
          onAppSupport={handleAppSupport}
          onTermsPrivacy={handleTermsPrivacy}
        />
      )}

      <CrLoginRequiredModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
        onSignUp={handleSignUp}
        initialMode={loginModalMode}
      />

      <CrForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />

      <div className="account-settings-version">
        <VersionNumber version="3.0.0" />
      </div>
    </div>
  )
}
