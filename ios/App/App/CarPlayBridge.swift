//
//  CarPlayBridge.swift
//  App
//
//  CarPlay integration - provides audio app interface
//

import CarPlay
import MediaPlayer
import UIKit
import AVFoundation

class CarPlayBridge: UIResponder, CPTemplateApplicationSceneDelegate {

    weak var interfaceController: CPInterfaceController?
    private var nowPlayingTemplate: CPNowPlayingTemplate?

    // Shared singleton for direct access from NativeAudioPlayer
    static var shared: CarPlayBridge?

    // CarPlay connected
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {

        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🚗🎵 CarPlay scene connected!")
        print("🚗 Template scene: \(templateApplicationScene)")
        print("🚗 Interface controller: \(interfaceController)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        self.interfaceController = interfaceController
        CarPlayBridge.shared = self

        // Activate audio session for CarPlay
        activateAudioSession()

        // Set initial metadata so CarPlay doesn't show "failure to connect"
        setInitialMetadata()

        // Create Now Playing template
        print("🚗 Creating CPNowPlayingTemplate.shared...")
        nowPlayingTemplate = CPNowPlayingTemplate.shared
        print("🚗 ✅ Now Playing template created: \(String(describing: nowPlayingTemplate))")

        configureLiveStreamNowPlaying()

        // Set Now Playing template directly as root (no tab bar for live radio stream)
        print("🚗 Setting Now Playing as root template (no tab bar)...")
        interfaceController.setRootTemplate(nowPlayingTemplate!, animated: false) { success, error in
            if let error = error {
                print("🚗 ❌ Error setting root template: \(error)")
            } else {
                print("🚗 ✅ Now Playing root template set successfully, success: \(success)")
            }
        }

        print("🚗 CarPlay interface configuration complete")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        // Trigger immediate metadata poll when CarPlay connects
        NotificationCenter.default.post(name: Notification.Name("CarPlayConnected"), object: nil)
        print("🚗 Posted CarPlayConnected notification to trigger metadata poll")

        // Debug current state
        debugNowPlayingInfo()
        debugRemoteCommands()

        // Listen for metadata updates
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.checkForMetadataUpdates()
        }
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🚗 CarPlay scene will enter foreground")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        // Ensure Now Playing template is showing when returning to app
        if let interfaceController = interfaceController,
           let nowPlayingTemplate = nowPlayingTemplate {
            interfaceController.setRootTemplate(nowPlayingTemplate, animated: false)
            print("🚗 ✅ Restored Now Playing template as root")
        }
    }

    func templateApplicationSceneDidDisconnect(_ templateApplicationScene: CPTemplateApplicationScene) {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🚗 CarPlay disconnected")
        print("🚗 Template scene: \(templateApplicationScene)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        CarPlayBridge.shared = nil
        interfaceController = nil
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnect interfaceController: CPInterfaceController,
                                  from window: CPWindow) {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🚗 CarPlay disconnected from window")
        print("🚗 Template scene: \(templateApplicationScene)")
        print("🚗 Interface controller: \(interfaceController)")
        print("🚗 Window: \(window)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    }

    // MARK: - Audio Session

    private func activateAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [])
            try audioSession.setActive(true)
            print("🚗 ✅ Audio session activated for CarPlay")
        } catch {
            print("🚗 ❌ Failed to activate audio session: \(error)")
        }
    }

    private func setInitialMetadata() {
        var nowPlayingInfo: [String: Any] = [
            MPMediaItemPropertyTitle: "CHIRP Radio",
            MPMediaItemPropertyArtist: "Live Stream",
            MPMediaItemPropertyAlbumTitle: "Chicago Independent Radio Project",
            MPNowPlayingInfoPropertyIsLiveStream: true
        ]

        // Try to load fallback album art
        if let imagePath = Bundle.main.path(forResource: "public/images/album-art-fallback", ofType: "png"),
           let image = UIImage(contentsOfFile: imagePath) {
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
            print("🚗 ✅ Initial metadata set with album art")
        } else if let image = UIImage(named: "Splash") {
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
            print("🚗 ✅ Initial metadata set with Splash artwork")
        } else {
            print("🚗 ⚠️ Initial metadata set without artwork")
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        print("🚗 ✅ Initial Now Playing metadata configured for CarPlay")
    }

    // MARK: - Metadata Updates

    private var lastMetadataHash: Int = 0

    private func checkForMetadataUpdates() {
        guard let info = MPNowPlayingInfoCenter.default().nowPlayingInfo else {
            return
        }

        // Create a simple hash of the metadata to detect changes
        let title = info[MPMediaItemPropertyTitle] as? String ?? ""
        let artist = info[MPMediaItemPropertyArtist] as? String ?? ""
        let hashValue = (title + artist).hashValue

        if hashValue != lastMetadataHash && hashValue != 0 {
            lastMetadataHash = hashValue
            print("🚗 Metadata changed detected - refreshing CarPlay")
            debugNowPlayingInfo()
        }
    }


    private func configureLiveStreamNowPlaying() {
        guard let nowPlayingTemplate = nowPlayingTemplate else { return }

        // For live streams, we want album art to display but no skip/seek controls
        // The play/pause will come from MPRemoteCommandCenter automatically

        // Set isUpNextButtonEnabled to false since this is a live stream
        nowPlayingTemplate.isUpNextButtonEnabled = false

        // Set isAlbumArtistButtonEnabled to false - we don't need navigation to artist
        nowPlayingTemplate.isAlbumArtistButtonEnabled = false

        // Empty button array - rely entirely on MPRemoteCommandCenter for play/pause
        nowPlayingTemplate.updateNowPlayingButtons([])

        print("🚗 Configured Now Playing as live stream (no skip, no up next)")
    }

    private func debugNowPlayingInfo() {
        let info = MPNowPlayingInfoCenter.default().nowPlayingInfo
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🚗 CarPlay - Current Now Playing Info:")
        if let info = info {
            print("   Title: \(info[MPMediaItemPropertyTitle] as? String ?? "nil")")
            print("   Artist: \(info[MPMediaItemPropertyArtist] as? String ?? "nil")")
            print("   Album: \(info[MPMediaItemPropertyAlbumTitle] as? String ?? "nil")")
            print("   Is Live Stream: \(info[MPNowPlayingInfoPropertyIsLiveStream] as? Bool ?? false)")
            print("   Has Artwork: \(info[MPMediaItemPropertyArtwork] != nil)")
        } else {
            print("   ⚠️ NOW PLAYING INFO IS NIL - waiting for audio to start")
        }
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    }

    private func debugRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🚗 CarPlay - Remote Command Center Status:")
        print("   Play enabled: \(commandCenter.playCommand.isEnabled)")
        print("   Pause enabled: \(commandCenter.pauseCommand.isEnabled)")
        print("   Skip forward enabled: \(commandCenter.skipForwardCommand.isEnabled)")
        print("   Skip backward enabled: \(commandCenter.skipBackwardCommand.isEnabled)")
        print("   Next track enabled: \(commandCenter.nextTrackCommand.isEnabled)")
        print("   Previous track enabled: \(commandCenter.previousTrackCommand.isEnabled)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    }
}
