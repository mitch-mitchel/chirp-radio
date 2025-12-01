package org.chirp_radio.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.MediaBrowserServiceCompat
import androidx.media.session.MediaButtonReceiver

/**
 * MediaBrowserService for Android Auto integration
 * This service allows Android Auto to discover and control the CHIRP Radio stream
 */
class ChirpMediaService : MediaBrowserServiceCompat(), MediaSessionManager.MediaSessionCallback {

    internal lateinit var mediaSessionManager: MediaSessionManager
    private lateinit var audioPlayer: NativeAudioPlayer
    private var isForeground = false

    companion object {
        private const val MEDIA_ROOT_ID = "chirp_radio_root"
        private const val LIVE_STREAM_ID = "chirp_live_stream"
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "chirp_playback_channel"
        private const val STREAM_URL = "https://peridot.streamguys1.com:5185/live"

        // Static reference for plugin communication
        var instance: ChirpMediaService? = null

        // Callbacks to web layer (for media button events)
        var onPlayCommand: (() -> Unit)? = null
        var onPauseCommand: (() -> Unit)? = null

        // Callback for playback state changes
        var onPlaybackStateChanged: ((Boolean) -> Unit)? = null
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Create notification channel FIRST before anything else
        createNotificationChannel()

        // Initialize media session manager
        mediaSessionManager = MediaSessionManager(this).apply {
            initialize(this@ChirpMediaService)
        }

        // Set session token for MediaBrowserService
        sessionToken = mediaSessionManager.getMediaSessionToken()

        // Initialize audio player
        audioPlayer = NativeAudioPlayer(this).apply {
            setStreamUrl(STREAM_URL)
            onPlaybackStateChanged = { isPlaying, isBuffering ->
                // Only update notification if state actually changed
                if (mediaSessionManager.isPlaying != isPlaying) {
                    mediaSessionManager.updatePlaybackState(isPlaying)
                    if (isForeground) {
                        showNotification()
                    }
                    // Notify webview of state change
                    ChirpMediaService.onPlaybackStateChanged?.invoke(isPlaying)
                }
            }
            onError = { error ->
                android.util.Log.e("ChirpMediaService", "Audio player error: $error")
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        android.util.Log.d("ChirpMediaService", "onStartCommand called")

        // Start as foreground service immediately with a basic notification
        // This prevents Android from killing the service
        try {
            showNotification()
        } catch (e: Exception) {
            android.util.Log.e("ChirpMediaService", "Failed to start foreground", e)
        }

        return super.onStartCommand(intent, flags, startId)
    }

    override fun onDestroy() {
        super.onDestroy()
        audioPlayer.release()
        mediaSessionManager.release()
        instance = null
        onPlayCommand = null
        onPauseCommand = null
    }

    // MediaSessionCallback implementation
    override fun onPlay() {
        android.util.Log.d("ChirpMediaService", "onPlay called - starting playback")

        // Start audio playback first
        audioPlayer.play()

        // Update state
        mediaSessionManager.updatePlaybackState(true)

        // Show notification
        showNotification()

        // Notify web layer for UI updates
        onPlayCommand?.invoke()
        onPlaybackStateChanged?.invoke(true)
    }

    override fun onPause() {
        android.util.Log.d("ChirpMediaService", "onPause called - pausing playback")

        // Pause audio first
        audioPlayer.pause()

        // Update state
        mediaSessionManager.updatePlaybackState(false)

        // Update notification
        showNotification()

        // Notify web layer
        onPauseCommand?.invoke()
        onPlaybackStateChanged?.invoke(false)
    }

    override fun onStop() {
        audioPlayer.stop()
        onPauseCommand?.invoke()
        mediaSessionManager.updatePlaybackState(false)
        stopForeground(true)
        isForeground = false
    }

    // MediaBrowserService implementation
    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot {
        // Return the root for browsing
        return BrowserRoot(MEDIA_ROOT_ID, null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>
    ) {
        val mediaItems = mutableListOf<MediaBrowserCompat.MediaItem>()

        when (parentId) {
            MEDIA_ROOT_ID -> {
                // Add the live stream as a playable item
                val description = MediaDescriptionCompat.Builder()
                    .setMediaId(LIVE_STREAM_ID)
                    .setTitle("CHIRP Radio - Live Stream")
                    .setSubtitle("Chicago Independent Radio Project")
                    .setDescription("107.1 FM Chicago - Independent Music")
                    .build()

                mediaItems.add(
                    MediaBrowserCompat.MediaItem(
                        description,
                        MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                    )
                )
            }
        }

        result.sendResult(mediaItems)
    }

    override fun onSearch(query: String, extras: Bundle?, result: Result<MutableList<MediaBrowserCompat.MediaItem>>) {
        android.util.Log.d("ChirpMediaService", "🔍 Voice search query: '$query'")

        val mediaItems = mutableListOf<MediaBrowserCompat.MediaItem>()

        // Match various ways people might ask for CHIRP Radio
        val lowerQuery = query.lowercase()
        if (lowerQuery.contains("chirp") ||
            lowerQuery.contains("107.1") ||
            lowerQuery.contains("chicago") ||
            lowerQuery.contains("independent radio") ||
            lowerQuery.contains("live stream") ||
            lowerQuery.contains("radio")) {

            // Return the live stream as search result
            val description = MediaDescriptionCompat.Builder()
                .setMediaId(LIVE_STREAM_ID)
                .setTitle("CHIRP Radio - Live Stream")
                .setSubtitle("Chicago Independent Radio Project")
                .setDescription("107.1 FM Chicago - Independent Music")
                .build()

            mediaItems.add(
                MediaBrowserCompat.MediaItem(
                    description,
                    MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                )
            )

            android.util.Log.d("ChirpMediaService", "✅ Voice search matched CHIRP Radio")
        } else {
            android.util.Log.d("ChirpMediaService", "❌ Voice search: no match for '$query'")
        }

        result.sendResult(mediaItems)
    }

    // Public methods for plugin to call
    fun updateNowPlaying(title: String, artist: String, albumArtUrl: String?, dj: String) {
        mediaSessionManager.updateNowPlaying(title, artist, albumArtUrl, dj)
        if (isForeground) {
            showNotification()
        }
    }

    fun updatePlaybackState(isPlaying: Boolean) {
        // Only update media session and notification state
        // Do NOT control audio player here - play()/pause() are called directly from webview
        mediaSessionManager.updatePlaybackState(isPlaying)
        if (isForeground) {
            showNotification()
        } else if (isPlaying) {
            showNotification()
        }
    }

    fun setBufferingState() {
        mediaSessionManager.setBufferingState()
        if (isForeground) {
            showNotification()
        }
    }

    fun setErrorState(errorMessage: String) {
        mediaSessionManager.setErrorState(errorMessage)
        if (isForeground) {
            showNotification()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "CHIRP Radio Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Media playback controls for CHIRP Radio"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showNotification() {
        try {
            val mediaSession = mediaSessionManager.getMediaSessionToken()

            // Intent to open app
            val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val contentIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Build notification
            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(mediaSessionManager.currentTitle.ifEmpty { "CHIRP Radio" })
                .setContentText(mediaSessionManager.currentArtist.ifEmpty { "107.1 FM Chicago" })
                .setSubText(if (mediaSessionManager.currentDj.isNotEmpty()) "DJ: ${mediaSessionManager.currentDj}" else "")
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(contentIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(true)  // Keep notification persistent
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .apply {
                    // Add play/pause action
                    if (mediaSessionManager.isPlaying) {
                        addAction(
                            NotificationCompat.Action(
                                R.drawable.ic_pause,
                                "Pause",
                                MediaButtonReceiver.buildMediaButtonPendingIntent(
                                    this@ChirpMediaService,
                                    PlaybackStateCompat.ACTION_PAUSE
                                )
                            )
                        )
                    } else {
                        addAction(
                            NotificationCompat.Action(
                                R.drawable.ic_play,
                                "Play",
                                MediaButtonReceiver.buildMediaButtonPendingIntent(
                                    this@ChirpMediaService,
                                    PlaybackStateCompat.ACTION_PLAY
                                )
                            )
                        )
                    }

                    // Set style for media - this makes controls show on lock screen
                    setStyle(
                        androidx.media.app.NotificationCompat.MediaStyle()
                            .setMediaSession(mediaSession)
                            .setShowActionsInCompactView(0)
                    )
                }
                .build()

            startForeground(NOTIFICATION_ID, notification)
            isForeground = true
        } catch (e: Exception) {
            android.util.Log.e("ChirpMediaService", "Failed to show notification", e)
        }
    }
}
