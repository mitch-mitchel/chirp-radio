// src/pages/AdvertisementPreviewPage.tsx
import React from 'react'
import { useParams } from 'react-router'
import CrAdSpace from '../stories/CrAdSpace'

const AdvertisementPreviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [ad, setAd] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)

  // Poll for draft updates
  React.useEffect(() => {
    const fetchAd = async () => {
      try {
        const apiUrl = import.meta.env.VITE_CMS_API_URL || 'http://localhost:3000/api'
        const response = await fetch(`${apiUrl}/advertisements/${id}?draft=true`, {
          credentials: 'include',
        })
        const data = await response.json()
        setAd(data)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching advertisement:', error)
        setLoading(false)
      }
    }

    // Initial fetch
    fetchAd()

    // Poll every 2 seconds for updates
    const interval = setInterval(fetchAd, 2000)

    return () => clearInterval(interval)
  }, [id])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        Loading preview...
      </div>
    )
  }

  if (!ad) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        Advertisement not found
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '40px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <h1
          style={{
            fontFamily: 'Arial, sans-serif',
            marginBottom: '10px',
            fontSize: '24px',
          }}
        >
          Advertisement Preview
        </h1>
        <p
          style={{
            fontFamily: 'Arial, sans-serif',
            color: '#666',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          {ad.name} - {ad.size} - {ad.contentType}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '40px',
            backgroundColor: '#fafafa',
            borderRadius: '4px',
          }}
        >
          <CrAdSpace
            key={ad.updatedAt || Date.now()}
            size={ad.size}
            contentType={ad.contentType}
            src={ad.imageUrl || ad.image?.url}
            alt={ad.alt}
            videoSrc={(ad.videoUrl || ad.video?.url)?.trim()}
            htmlContent={ad.htmlContent}
            embedCode={ad.embedCode}
            href={ad.href}
            target={ad.target}
            showLabel={ad.showLabel}
            customWidth={ad.customWidth}
            customHeight={ad.customHeight}
          />
        </div>
      </div>
    </div>
  )
}

export default AdvertisementPreviewPage
