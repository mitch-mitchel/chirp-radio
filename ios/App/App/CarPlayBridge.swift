//
//  CarPlayBridge.swift
//  App
//
//  CarPlay integration - provides audio app interface
//

import CarPlay
import MediaPlayer
import UIKit

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

        // Create Now Playing template
        print("🚗 Creating CPNowPlayingTemplate.shared...")
        nowPlayingTemplate = CPNowPlayingTemplate.shared
        print("🚗 ✅ Now Playing template created: \(String(describing: nowPlayingTemplate))")

        configureLiveStreamNowPlaying()

        // For live radio, skip tab bar and go directly to Now Playing screen
        print("🚗 Setting Now Playing template as root (skip tab bar for live stream)...")
        interfaceController.setRootTemplate(nowPlayingTemplate!, animated: false) { success, error in
            if let error = error {
                print("🚗 ❌ Error setting root template: \(error)")
            } else {
                print("🚗 ✅ Root template set successfully, success: \(success)")
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
