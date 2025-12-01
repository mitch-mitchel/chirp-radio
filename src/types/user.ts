// User type definitions for CHIRP Radio

export type UserRole = 'Listener' | 'Volunteer' | 'Regular DJ' | 'Substitute DJ' | 'Board Member'

export interface CollectionTrack {
  id: string
  artistName: string
  trackName: string
  albumName: string
  labelName: string
  albumArt?: string
  albumArtAlt?: string
  isLocal?: boolean
  dateAdded: string // ISO date string
}

export interface DonationHistory {
  id: string
  date: string // ISO date string or formatted date
  type: string // e.g., "One-time", "Monthly", "Annual"
  amount: number
  status?: string // e.g., "Active", "Completed", "Pending"
  receiptUrl?: string
}

export interface PurchaseHistory {
  id: string
  date: string // ISO date string or formatted date
  item: string
  amount: number
  status?: string // e.g., "Completed", "Pending", "Shipped"
}

export interface UserPreferences {
  emailNotifications?: boolean
  showNotifications?: boolean
  darkMode?: 'light' | 'dark' | 'device'
  autoPlay?: boolean
}

export interface SocialLinks {
  facebook?: string
  instagram?: string
  twitter?: string
  bluesky?: string
  linkedin?: string
}

export interface User {
  // ==========================================
  // BASE FIELDS (All Users)
  // ==========================================
  id: string
  email: string
  username?: string
  firstName?: string
  lastName?: string
  memberSince?: string
  roles: UserRole[] // Array of roles, e.g., ["Listener", "Volunteer", "Regular DJ"]

  // Profile
  profileImage?: string
  fullProfileImage?: string
  profileImageOrientation?: 'square' | 'landscape' | 'portrait'
  bio?: string
  location?: string

  // User Data
  collection: CollectionTrack[]
  favoriteDJs: string[]
  preferences: UserPreferences
  donationHistory?: DonationHistory[]
  purchaseHistory?: PurchaseHistory[]
  onboardingCompleted?: boolean

  // ==========================================
  // VOLUNTEER FIELDS (Volunteer, DJ, Board Member)
  // ==========================================
  // Contact Info
  primaryPhoneType?: string
  primaryPhone?: string
  secondaryPhoneType?: string
  secondaryPhone?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string

  // Volunteer Info
  age?: string
  education?: string
  employer?: string
  volunteerOrgs?: string[]
  hasRadioExperience?: string
  radioStations?: string
  specialSkills?: string[]
  hearAboutChirp?: string[]
  interests?: string[]
  wantsToDJ?: string
  djAvailability?: string[]
  donorLevel?: string

  // Social Links
  socialLinks?: SocialLinks

  // ==========================================
  // DJ FIELDS (Regular DJ & Substitute DJ)
  // ==========================================
  djId?: number
  djName?: string
  showName?: string
  showTime?: string
  djExcerpt?: string
  djBio?: string
  djDonationLink?: string

  // Substitute DJ specific
  substituteAvailability?: string[] // e.g., ["Weekday morning", "Weekend afternoon"]
  canSubstituteFor?: string[] // DJ IDs they can fill in for

  // ==========================================
  // BOARD MEMBER FIELDS
  // ==========================================
  boardPosition?: string // e.g., "President", "Treasurer", "Secretary"
  boardSince?: string
  boardTermEnd?: string

  // Legacy/Demo fields
  password?: string // For demo purposes only
  [key: string]: unknown // Allow additional fields for flexibility
}

// Helper functions for role checking
export function hasRole(user: User | null, role: UserRole): boolean {
  if (!user) return false
  return user.roles.includes(role)
}

export function isListener(user: User | null): boolean {
  return hasRole(user, 'Listener')
}

export function isVolunteer(user: User | null): boolean {
  return hasRole(user, 'Volunteer')
}

export function isDJ(user: User | null): boolean {
  return hasRole(user, 'Regular DJ') || hasRole(user, 'Substitute DJ')
}

export function isRegularDJ(user: User | null): boolean {
  return hasRole(user, 'Regular DJ')
}

export function isSubstituteDJ(user: User | null): boolean {
  return hasRole(user, 'Substitute DJ')
}

export function isBoardMember(user: User | null): boolean {
  return hasRole(user, 'Board Member')
}

// Get primary role (for display purposes - returns highest "level" role)
export function getPrimaryRole(user: User | null): UserRole | null {
  if (!user) return null

  // Priority order: Board Member > DJ > Volunteer > Listener
  if (hasRole(user, 'Board Member')) return 'Board Member'
  if (hasRole(user, 'Regular DJ')) return 'Regular DJ'
  if (hasRole(user, 'Substitute DJ')) return 'Substitute DJ'
  if (hasRole(user, 'Volunteer')) return 'Volunteer'
  if (hasRole(user, 'Listener')) return 'Listener'

  return null
}
