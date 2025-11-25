// src/hooks/useLivePreview.ts
import { useLivePreview as usePayloadLivePreview } from '@payloadcms/live-preview-react'

// Use environment variable or fallback to production CMS URL
const PAYLOAD_SERVER_URL =
  import.meta.env.VITE_CMS_SERVER_URL ||
  'http://chirp-cms-alb-1737757894.us-east-1.elb.amazonaws.com'

/**
 * Wrapper hook for PayloadCMS live preview
 * Returns the live-updated data when editing in the CMS admin panel
 */
export function useLivePreview<T extends Record<string, unknown>>({
  initialData,
  depth = 2,
}: {
  initialData: T
  depth?: number
}) {
  const { data } = usePayloadLivePreview<T>({
    initialData,
    serverURL: PAYLOAD_SERVER_URL,
    depth,
  })

  return data
}
