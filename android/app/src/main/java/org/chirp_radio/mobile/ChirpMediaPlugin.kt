package org.chirp_radio.mobile

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor plugin for Android Auto integration
 * Bridges web audio player to native Android media session
 */
@CapacitorPlugin(name = "ChirpMediaPlugin")
class ChirpMediaPlugin : Plugin() {

    private var serviceStarted = false

    override fun load() {
        super.load()

        // Set up callbacks from service to web
        ChirpMediaService.onPlayCommand = {
            notifyListeners("mediaCommand", JSObject().apply {
                put("command", "play")
            })
        }

        ChirpMediaService.onPauseCommand = {
            notifyListeners("mediaCommand", JSObject().apply {
                put("command", "pause")
            })
        }
    }

    @PluginMethod
    fun updateNowPlaying(call: PluginCall) {
        val title = call.getString("title") ?: ""
        val artist = call.getString("artist") ?: ""
        val albumArtUrl = call.getString("albumArtUrl")
        val dj = call.getString("dj") ?: ""

        // Ensure service is started
        ensureServiceStarted()

        // Update service
        ChirpMediaService.instance?.updateNowPlaying(title, artist, albumArtUrl, dj)

        call.resolve()
    }

    @PluginMethod
    fun setPlaybackState(call: PluginCall) {
        val isPlaying = call.getBoolean("isPlaying", false) ?: false

        // Ensure service is started
        ensureServiceStarted()

        // Update service
        ChirpMediaService.instance?.updatePlaybackState(isPlaying)

        call.resolve()
    }

    @PluginMethod
    fun setBufferingState(call: PluginCall) {
        // Ensure service is started
        ensureServiceStarted()

        // Update service to buffering state
        ChirpMediaService.instance?.setBufferingState()

        call.resolve()
    }

    @PluginMethod
    fun setErrorState(call: PluginCall) {
        val errorMessage = call.getString("errorMessage") ?: "Stream connection failed"

        // Ensure service is started
        ensureServiceStarted()

        // Update service to error state
        ChirpMediaService.instance?.setErrorState(errorMessage)

        call.resolve()
    }

    @PluginMethod
    fun getCurrentState(call: PluginCall) {
        val service = ChirpMediaService.instance
        val result = JSObject().apply {
            put("isPlaying", service?.mediaSessionManager?.isPlaying ?: false)
            put("title", service?.mediaSessionManager?.currentTitle ?: "")
            put("artist", service?.mediaSessionManager?.currentArtist ?: "")
            put("dj", service?.mediaSessionManager?.currentDj ?: "")
        }

        call.resolve(result)
    }

    private fun ensureServiceStarted() {
        if (!serviceStarted) {
            val context = activity ?: context
            val intent = Intent(context, ChirpMediaService::class.java)

            // Start service based on Android version
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            serviceStarted = true
        }
    }
}
