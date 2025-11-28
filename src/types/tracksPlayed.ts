// Types for tracks played from the CMS database

export interface TrackPlayed {
  id: string | number
  playlistEventId?: string
  artistName: string
  trackName: string
  albumName?: string
  labelName?: string
  albumArt?: string
  djName: string
  showName: string
  isLocal?: boolean
  playedAt: string // ISO date string
  createdAt?: string
  updatedAt?: string
}

export interface TracksPlayedResponse {
  docs: TrackPlayed[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
  pagingCounter: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
}
