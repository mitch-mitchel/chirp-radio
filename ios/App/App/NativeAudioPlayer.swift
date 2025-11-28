import Foundation
import Capacitor
import AVFoundation
import MediaPlayer

@objc(NativeAudioPlayer)
public class NativeAudioPlayer: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "NativeAudioPlayer"
    public let jsName = "NativeAudioPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setStreamUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBackgroundPolling", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBackgroundPolling", returnType: CAPPluginReturnPromise)
    ]

    private var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var currentStreamUrl: String?
    private var isPlaying = false
    private var itemObservers: [NSKeyValueObservation] = []
    private var backgroundPollingTimer: Timer?
    private var pollingApiUrl: String?
    private var lastTrackId: String = ""
    private var pollsSinceTrackChange: Int = 0
    private var backgroundSession: URLSession?
    private var timeObserverToken: Any?
    private var lastPollTime: Date = Date.distantPast
    private var isPollingActive: Bool = false
    private var albumArtCache: [String: UIImage] = [:] // Cache album art by URL
    private let cacheQueue = DispatchQueue(label: "com.chirpradio.albumArtCache", qos: .userInitiated) // Serial queue for thread-safe cache access
    private var pauseTimestamp: Date?
    private let pauseThreshold: TimeInterval = 5 * 60 // 5 minutes in seconds
    private var wasIntentionallyStopped = false // Track if user explicitly stopped playback

    // Lazy-loaded fallback album art from bundled image
    private lazy var fallbackAlbumArt: MPMediaItemArtwork? = {
        // Try to load from public/images directory first
        if let imagePath = Bundle.main.path(forResource: "public/images/album-art-fallback", ofType: "png"),
           let image = UIImage(contentsOfFile: imagePath) {
            print("📷 Loaded fallback album art from public/images/album-art-fallback.png")
            return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        }

        // Fallback to Splash image from Assets if public image not found
        if let image = UIImage(named: "Splash") {
            print("📷 Loaded fallback album art from Splash asset")
            return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        }

        print("⚠️ No fallback album art available")
        return nil
    }()

    public override func load() {
        print("🎵 NativeAudioPlayer plugin loaded")

        // Configure audio session for background playback
        configureAudioSession()

        // Setup remote command handlers
        setupRemoteCommands()

        // Listen for audio session interruptions
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioSessionInterruption),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )

        // Listen for route changes (headphones unplugged, etc.)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )

        // Listen for CarPlay connection
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleCarPlayConnected),
            name: Notification.Name("carPlayConnected"),
            object: nil
        )
    }

    deinit {
        backgroundPollingTimer?.invalidate()
        backgroundPollingTimer = nil

        // Remove time observer
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
        }

        NotificationCenter.default.removeObserver(self)
        cleanupPlayerObservers()
    }

    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [])
            try audioSession.setActive(true)
            print("✅ Audio session configured for native playback")
        } catch {
            print("❌ Failed to configure audio session: \(error)")
        }
    }

    @objc private func handleAudioSessionInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        print("🔔 Audio session interruption: \(type == .began ? "BEGAN" : "ENDED")")

        if type == .ended {
            // Interruption ended - reactivate audio session
            configureAudioSession()

            // Resume playback if we were playing
            if isPlaying {
                print("🔄 Resuming playback after interruption")
                playAudio()
            }
        } else {
            // Interruption began
            isPlaying = false
            notifyJavaScriptStateChange(isPlaying: false)
        }
    }

    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        print("🎧 Audio route changed: reason \(reasonValue)")

        // If headphones were unplugged, pause playback
        if reason == .oldDeviceUnavailable {
            print("⏸️ Audio device disconnected - pausing")
            pauseAudio()
            notifyJavaScriptStateChange(isPlaying: false)
        }
    }

    @objc private func handleCarPlayConnected() {
        print("🚗 NativeAudioPlayer: CarPlay connected - notifying JavaScript to poll metadata")
        DispatchQueue.main.async {
            self.notifyListeners("carPlayConnected", data: [:])
        }
    }

    private func cleanupPlayerObservers() {
        itemObservers.forEach { $0.invalidate() }
        itemObservers.removeAll()
    }

    private func setupRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()

        print("🎵 NativeAudioPlayer: Setting up remote commands")

        // Set up direct command handlers (no NotificationCenter delay)
        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] event in
            print("🎵 NativeAudioPlayer: Direct PLAY command")
            self?.handleRemotePlay()
            return .success
        }

        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] event in
            print("⏸️ NativeAudioPlayer: Direct PAUSE command")
            self?.handleRemotePause()
            return .success
        }

        print("✅ NativeAudioPlayer: Direct remote commands configured")
    }

    private func handleRemotePlay() {
        print("🎵 NativeAudioPlayer.handleRemotePlay() called")

        // Prevent auto-resume if user explicitly stopped playback
        if wasIntentionallyStopped {
            print("⚠️ Ignoring remote play command - user intentionally stopped playback")
            print("💡 User must manually press play to resume")
            return
        }

        playAudio()
        updateNowPlayingPlaybackState()
        notifyJavaScriptStateChange(isPlaying: true)
    }

    private func handleRemotePause() {
        print("⏸️ NativeAudioPlayer.handleRemotePause() called")
        pauseAudio()
        updateNowPlayingPlaybackState()
        notifyJavaScriptStateChange(isPlaying: false)
    }

    private func notifyJavaScriptStateChange(isPlaying: Bool) {
        // Use Capacitor's notifyListeners method instead of evalWithPlugin
        DispatchQueue.main.async {
            self.notifyListeners("playbackStateChanged", data: [
                "isPlaying": isPlaying
            ])
            print("📡 Notified listeners: isPlaying = \(isPlaying)")
        }
    }

    private func updateNowPlayingPlaybackState() {
        // Update Now Playing Info playback rate
        if var nowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo {
            nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
            print("🔄 Updated Now Playing playback rate: \(isPlaying ? 1.0 : 0.0)")
        }
    }

    @objc func setStreamUrl(_ call: CAPPluginCall) {
        guard let url = call.getString("url") else {
            call.reject("URL is required")
            return
        }

        print("📻 Setting stream URL: \(url)")
        currentStreamUrl = url

        // Create new player item
        guard let streamURL = URL(string: url) else {
            call.reject("Invalid URL")
            return
        }

        // Stop current playback if any
        if isPlaying {
            player?.pause()
        }

        // Remove time observer from OLD player before creating new one
        if let token = timeObserverToken, let oldPlayer = player {
            oldPlayer.removeTimeObserver(token)
            timeObserverToken = nil
            print("🔄 Removed time observer from old player before creating new one")
        }

        // Clean up old observers
        cleanupPlayerObservers()

        // Create new player item and player
        playerItem = AVPlayerItem(url: streamURL)
        player = AVPlayer(playerItem: playerItem)

        // Set audio to prefer high quality
        player?.automaticallyWaitsToMinimizeStalling = true

        // Enable external playback for CarPlay
        player?.allowsExternalPlayback = true
        player?.usesExternalPlaybackWhileExternalScreenIsActive = true
        print("✅ External playback enabled for CarPlay")

        // Set up player item monitoring
        setupPlayerItemMonitoring()

        // Set initial Now Playing info for CarPlay to recognize the app
        setInitialNowPlayingInfo()

        // Re-attach time observer if polling was active (CRITICAL FIX)
        // setStreamUrl creates a NEW player, destroying the old time observer
        if isPollingActive {
            print("🔄 Re-attaching time observer to new player (polling is active)")
            setupTimeObserver()
        }

        print("✅ Stream URL set and player initialized")
        call.resolve()
    }

    private func setInitialNowPlayingInfo() {
        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = "CHIRP Radio"
        nowPlayingInfo[MPMediaItemPropertyArtist] = "Chicago Independent Radio Project"
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = "Live Stream"
        nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = true
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = 0.0 // Not playing yet

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        print("🎵 Initial Now Playing info set for CarPlay discovery")
    }

    private func setupPlayerItemMonitoring() {
        guard let playerItem = playerItem else { return }

        // Monitor playback stalled
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerItemStalled),
            name: .AVPlayerItemPlaybackStalled,
            object: playerItem
        )

        // Monitor failed to play to end time
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerItemFailedToPlay),
            name: .AVPlayerItemFailedToPlayToEndTime,
            object: playerItem
        )

        // Monitor player item status changes
        let statusObserver = playerItem.observe(\.status, options: [.new, .old]) { [weak self] item, change in
            guard let self = self else { return }
            print("📊 Player item status changed: \(item.status.rawValue)")

            if item.status == .failed {
                print("❌ Player item entered FAILED state")
                if let error = item.error {
                    print("   Error: \(error.localizedDescription)")
                }
                // Attempt recovery
                self.recoverFromFailedState()
            }
        }

        itemObservers.append(statusObserver)
    }

    @objc private func playerItemStalled(notification: Notification) {
        print("⚠️ Player item playback STALLED")

        // For live streams, stalling often means we need to reconnect
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self = self else { return }

            // Check if still stalled after 2 seconds
            if let player = self.player,
               player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
                print("🔄 Still stalled after 2s - recreating player item")
                self.recreatePlayerItem()
            }
        }
    }

    private func recoverFromFailedState() {
        print("🔄 Attempting to recover from failed state")
        recreatePlayerItem()
    }

    private func recreatePlayerItem() {
        guard let currentUrl = currentStreamUrl,
              let streamURL = URL(string: currentUrl) else {
            print("❌ Cannot recreate player item - no URL available")
            return
        }

        print("🔄 Recreating player item with URL: \(currentUrl)")

        let wasPlaying = isPlaying
        isPlaying = false

        // Clean up old observers
        cleanupPlayerObservers()

        // Create fresh player item
        let newItem = AVPlayerItem(url: streamURL)
        playerItem = newItem

        // Replace in existing player or create new one
        if let player = player {
            player.replaceCurrentItem(with: newItem)
        } else {
            player = AVPlayer(playerItem: newItem)
            player?.automaticallyWaitsToMinimizeStalling = true
        }

        // Set up monitoring for new item
        setupPlayerItemMonitoring()

        // Resume playback if we were playing
        if wasPlaying {
            print("▶️ Resuming playback after recreation")
            // Wait for item to be ready before playing
            waitForPlayerItemReady(completion: { [weak self] success in
                if success {
                    self?.playAudio()
                } else {
                    print("❌ Player item failed to become ready")
                }
            })
        }

        print("✅ Player item recreated")
    }

    private func waitForPlayerItemReady(maxAttempts: Int = 10, completion: @escaping (Bool) -> Void) {
        guard let playerItem = playerItem else {
            completion(false)
            return
        }

        var attempts = 0

        func checkStatus() {
            attempts += 1

            switch playerItem.status {
            case .readyToPlay:
                print("✅ Player item is ready")
                completion(true)
            case .failed:
                print("❌ Player item failed")
                completion(false)
            case .unknown:
                if attempts < maxAttempts {
                    print("⏳ Player item not ready yet (attempt \(attempts)/\(maxAttempts))")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        checkStatus()
                    }
                } else {
                    print("⚠️ Player item timeout after \(maxAttempts) attempts")
                    completion(false)
                }
            @unknown default:
                completion(false)
            }
        }

        checkStatus()
    }

    @objc private func playerItemFailedToPlay(notification: Notification) {
        print("❌ Player item failed to play")
        if let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error {
            print("   Error: \(error.localizedDescription)")
        }

        // Attempt recovery
        recoverFromFailedState()

        // Notify JavaScript
        notifyListeners("playerError", data: ["error": "Playback failed"])
    }

    @objc func play(_ call: CAPPluginCall) {
        print("▶️ Play called from JavaScript")

        // Check if player exists
        guard let player = player else {
            print("❌ ERROR: Player not initialized - cannot play")
            call.reject("Player not initialized. Call setStreamUrl first.")
            return
        }

        // Check if player item exists
        guard let playerItem = playerItem else {
            print("❌ ERROR: Player item is nil - cannot play")
            call.reject("Player item not initialized")
            return
        }

        // Check player item status
        print("📊 Player item status: \(playerItem.status.rawValue)")
        print("📊 Player time control status: \(player.timeControlStatus.rawValue)")
        print("📊 Current isPlaying state: \(isPlaying)")

        playAudio()
        updateNowPlayingPlaybackState()
        call.resolve(["isPlaying": true])
    }

    private func playAudio() {
        guard let player = player else {
            print("❌ Player not initialized in playAudio()")
            return
        }

        guard let playerItem = playerItem else {
            print("❌ Player item is nil in playAudio()")
            return
        }

        // Check if paused for too long - reinitialize to get live edge
        if let pauseTime = pauseTimestamp {
            let pauseDuration = Date().timeIntervalSince(pauseTime)
            if pauseDuration > pauseThreshold {
                print("🔄 Paused for \(Int(pauseDuration))s (> \(Int(pauseThreshold))s) - recreating player to seek to live edge")
                recreatePlayerItem()
                pauseTimestamp = nil
                return
            }
        }

        // Clear pause timestamp
        pauseTimestamp = nil

        // Clear intentional stop flag - user is now playing
        wasIntentionallyStopped = false

        // Check if player item has failed or become stale
        if playerItem.status == .failed {
            print("❌ Player item has FAILED status - recreating")
            recreatePlayerItem()
            return
        }

        // Ensure audio session is active (might have been deactivated)
        configureAudioSession()

        print("🎬 Calling player.play() - item status: \(playerItem.status.rawValue)")
        player.play()
        isPlaying = true

        print("✅ Native playback started - rate: \(player.rate)")
    }

    @objc func pause(_ call: CAPPluginCall) {
        print("⏸️ Pause called from JavaScript")
        pauseAudio()
        updateNowPlayingPlaybackState()
        call.resolve(["isPlaying": false])
    }

    private func pauseAudio() {
        player?.pause()
        isPlaying = false
        pauseTimestamp = Date()
        print("✅ Native playback paused at \(pauseTimestamp!)")
    }

    @objc func stop(_ call: CAPPluginCall) {
        print("⏹️ Stop called - setting intentional stop flag")
        player?.pause()
        player?.seek(to: .zero)
        isPlaying = false
        wasIntentionallyStopped = true // User explicitly stopped playback
        call.resolve()
    }

    @objc func updateMetadata(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let album = call.getString("album") ?? ""
        let albumArtUrl = call.getString("albumArt") ?? ""

        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("📝 NativeAudioPlayer.updateMetadata() called")
        print("   Title: \(title)")
        print("   Artist: \(artist)")
        print("   Album: \(album)")
        print("   Current playback state: \(isPlaying ? "PLAYING" : "PAUSED")")

        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = title
        nowPlayingInfo[MPMediaItemPropertyArtist] = artist
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = album

        // Mark as live stream
        nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = true
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0

        // Load album art if provided
        if !albumArtUrl.isEmpty, let url = URL(string: albumArtUrl) {
            // Check cache first (thread-safe)
            if let cachedImage = getCachedImage(for: albumArtUrl) {
                print("🎯 Using cached album art")
                let artwork = MPMediaItemArtwork(boundsSize: cachedImage.size) { _ in cachedImage }
                nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork

                // Set metadata WITH artwork in one update (no blip)
                DispatchQueue.main.async {
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                    print("✅ Set metadata WITH cached artwork (single update)")
                    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                }
                call.resolve()
                return
            }

            print("🖼️ Loading album art: \(albumArtUrl)")

            // Create URLSession with timeout for cellular reliability
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 15.0
            config.timeoutIntervalForResource = 30.0
            config.waitsForConnectivity = false
            let session = URLSession(configuration: config)

            session.dataTask(with: url) { [weak self] data, response, error in
                guard let self = self else { return }

                if let error = error {
                    print("❌ Error loading album art: \(error.localizedDescription)")
                    // Set metadata with fallback CHIRP logo
                    if let fallback = self.fallbackAlbumArt {
                        nowPlayingInfo[MPMediaItemPropertyArtwork] = fallback
                        print("🎨 Using fallback CHIRP logo for album art")
                    }
                    DispatchQueue.main.async {
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                        print("✅ Set metadata with fallback artwork (load failed)")
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                    }
                    return
                }

                if let data = data, let image = UIImage(data: data) {
                    print("✅ Album art loaded, size: \(image.size)")

                    // Cache the image (thread-safe)
                    self.cacheImage(image, for: albumArtUrl)
                    print("💾 Cached album art")

                    let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork

                    // Set metadata WITH artwork in one update (no blip)
                    DispatchQueue.main.async {
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                        print("✅ Set metadata WITH artwork (single update)")
                        print("   Lock screen should now show: \(nowPlayingInfo[MPMediaItemPropertyTitle] as? String ?? "")")
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                    }
                } else {
                    print("⚠️ Failed to create UIImage from album art data")
                    // Set metadata with fallback CHIRP logo
                    if let fallback = self.fallbackAlbumArt {
                        nowPlayingInfo[MPMediaItemPropertyArtwork] = fallback
                        print("🎨 Using fallback CHIRP logo for album art")
                    }
                    DispatchQueue.main.async {
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                        print("✅ Set metadata with fallback artwork (image creation failed)")
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                    }
                }
            }.resume()
        } else {
            // No artwork URL - use fallback CHIRP logo
            if let fallback = fallbackAlbumArt {
                nowPlayingInfo[MPMediaItemPropertyArtwork] = fallback
                print("🎨 Using fallback CHIRP logo (no URL provided)")
            }
            DispatchQueue.main.async {
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                print("✅ Metadata set with fallback artwork (no URL provided)")
                print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            }
        }

        call.resolve()
    }


    @objc func getPlaybackState(_ call: CAPPluginCall) {
        call.resolve([
            "isPlaying": isPlaying,
            "currentTime": player?.currentTime().seconds ?? 0
        ])
    }

    // MARK: - Album Art Cache (Thread-Safe)

    private func getCachedImage(for url: String) -> UIImage? {
        return cacheQueue.sync {
            return albumArtCache[url]
        }
    }

    private func cacheImage(_ image: UIImage, for url: String) {
        cacheQueue.async { [weak self] in
            self?.albumArtCache[url] = image
        }
    }

    // MARK: - Background Polling

    // Setup time observer on the current player for background polling
    private func setupTimeObserver() {
        guard let player = player else {
            print("❌ Cannot setup time observer - player not initialized")
            return
        }

        // Remove existing observer if any (should only happen if called multiple times on same player)
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
            print("🔄 Removed existing time observer from current player before creating new one")
        }

        // CRITICAL: AVPlayer's periodic time observer ONLY fires when rate > 0 (playing)
        // If the stream is paused, polling will STOP. We need a fallback timer.
        // Check every 1 second, but only poll API every 5 seconds
        let interval = CMTime(seconds: 1.0, preferredTimescale: CMTimeScale(NSEC_PER_SEC))

        // Use dedicated background queue with userInitiated QoS
        let observerQueue = DispatchQueue(label: "com.chirpradio.polling", qos: .userInitiated)

        timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: observerQueue) { [weak self] time in
            guard let self = self else { return }

            let now = Date()
            let timeSinceLastPoll = now.timeIntervalSince(self.lastPollTime)

            // Only poll every 5 seconds
            if timeSinceLastPoll >= 5.0 {
                let timestamp = now.timeIntervalSince1970
                print("⏰ [TIME OBSERVER FIRED] \(timestamp) - \(String(format: "%.1f", timeSinceLastPoll))s since last poll")
                print("   Player time: \(time.seconds)s")
                print("   Player rate: \(self.player?.rate ?? 0)")
                print("   Thread: \(Thread.isMainThread ? "MAIN" : "BACKGROUND")")

                // Get app state on main thread to avoid checker warning
                DispatchQueue.main.async {
                    let appState = UIApplication.shared.applicationState.rawValue
                    print("   App state: \(appState) (0=active, 1=inactive, 2=background)")
                }

                self.lastPollTime = now
                self.pollNowPlayingAPI()
            }
        }

        print("✅ Time observer added to AVPlayer - will fire every 1s during playback")
        print("   ⚠️ WARNING: Time observer ONLY fires when player.rate > 0 (playing)")
        print("   API polling will occur every 5s")

        // CRITICAL FIX: Add backup timer that fires even when player is paused
        // This ensures metadata updates continue even if user pauses the stream
        print("🔧 Starting backup polling timer for when player is paused...")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Invalidate any existing timer
            self.backgroundPollingTimer?.invalidate()

            // Create a timer that fires every 5 seconds regardless of player state
            self.backgroundPollingTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
                guard let self = self else { return }

                let now = Date()
                let timeSinceLastPoll = now.timeIntervalSince(self.lastPollTime)

                // Only poll if time observer hasn't already polled recently (avoid duplicate polls)
                if timeSinceLastPoll >= 4.5 { // Slightly less than 5s to avoid race
                    print("⏰ [BACKUP TIMER FIRED] Player might be paused - forcing poll")
                    print("   Time since last poll: \(String(format: "%.1f", timeSinceLastPoll))s")
                    print("   Player rate: \(self.player?.rate ?? 0)")
                    self.lastPollTime = now
                    self.pollNowPlayingAPI()
                }
            }
            print("✅ Backup polling timer started - will poll every 5s even when paused")
        }
    }

    @objc func startBackgroundPolling(_ call: CAPPluginCall) {
        guard let apiUrl = call.getString("apiUrl") else {
            call.reject("API URL is required")
            return
        }

        pollingApiUrl = apiUrl
        isPollingActive = true

        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("📡 [START POLLING] Starting background polling with AVPlayer time observer")
        print("   API URL: \(apiUrl)")
        print("   Player exists: \(player != nil)")
        print("   Player is playing: \(isPlaying)")
        print("   Player rate: \(player?.rate ?? 0)")
        print("   Audio session active: \(AVAudioSession.sharedInstance().isOtherAudioPlaying)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        guard player != nil else {
            print("❌ Cannot start polling - player not initialized")
            call.reject("Player not initialized")
            return
        }

        // Setup time observer
        setupTimeObserver()

        // Immediate first poll
        print("🚀 Executing immediate first poll...")
        lastPollTime = Date()
        pollNowPlayingAPI()

        call.resolve(["status": "started", "method": "time_observer", "interval": 5.0])
    }

    @objc func stopBackgroundPolling(_ call: CAPPluginCall) {
        print("🛑 Stopping background polling")
        isPollingActive = false

        backgroundPollingTimer?.invalidate()
        backgroundPollingTimer = nil

        // Remove time observer
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
            print("✅ Time observer removed")
        }

        call.resolve(["status": "stopped"])
    }

    private func pollNowPlayingAPI() {
        guard let urlString = pollingApiUrl else {
            print("❌ [POLL] No API URL configured for polling")
            return
        }

        // Convert relative URLs to absolute URLs
        var fullUrlString = urlString
        if urlString.hasPrefix("/") {
            // Relative URL - prepend base URL (matches Vite proxy target in vite.config.ts)
            fullUrlString = "https://chirpradio.appspot.com\(urlString)"
            print("🔗 [POLL] Converted relative URL to absolute: \(fullUrlString)")
        }

        guard let url = URL(string: fullUrlString) else {
            print("❌ [POLL] Invalid API URL for polling: \(fullUrlString)")
            return
        }

        let pollStartTime = Date()
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🔄 [POLL START] Polling now playing API at \(pollStartTime.timeIntervalSince1970)")
        print("   Original URL: \(urlString)")
        print("   Full URL: \(fullUrlString)")
        print("   App state: \(UIApplication.shared.applicationState.rawValue) (0=active, 1=inactive, 2=background)")
        print("   Is playing: \(isPlaying)")

        let task = URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            guard let self = self else {
                print("❌ [POLL] Self is nil in completion handler")
                return
            }

            let pollEndTime = Date()
            let duration = pollEndTime.timeIntervalSince(pollStartTime)
            print("⏱️ [POLL] API response received in \(String(format: "%.2f", duration))s")

            if let error = error {
                print("❌ [POLL ERROR] \(error.localizedDescription)")
                return
            }

            guard let data = data else {
                print("❌ [POLL] No data received from API")
                return
            }

            print("✅ [POLL] Received \(data.count) bytes of data")

            do {
                // Parse JSON response
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let nowPlaying = json["now_playing"] as? [String: Any] {

                    let artist = nowPlaying["artist"] as? String ?? "Unknown Artist"
                    let track = nowPlaying["track"] as? String ?? "Unknown Track"
                    let album = nowPlaying["album"] as? String ?? nowPlaying["release"] as? String ?? "Unknown Album"

                    // Create track ID to detect changes
                    let trackId = "\(artist)|\(track)"

                    print("📊 [POLL] Current track: \(trackId)")
                    print("   Last track: \(self.lastTrackId)")

                    if trackId != self.lastTrackId {
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                        print("🎵 [TRACK CHANGE DETECTED]")
                        print("   Old: \(self.lastTrackId)")
                        print("   New: \(trackId)")
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

                        self.lastTrackId = trackId
                        self.pollsSinceTrackChange = 0 // Reset poll counter for new track

                        // Get album art URL - wait for Last.fm before using empty/fallback
                        var albumArtUrl = ""
                        if let albumArt = nowPlaying["albumArt"] as? String {
                            albumArtUrl = albumArt
                        } else if let lastfmUrls = nowPlaying["lastfm_urls"] as? [String: Any] {
                            albumArtUrl = lastfmUrls["large_image"] as? String ??
                                         lastfmUrls["med_image"] as? String ??
                                         lastfmUrls["sm_image"] as? String ?? ""
                        }

                        // If no album art yet and we haven't waited 30 seconds, pass empty string
                        // This prevents showing fallback before Last.fm has a chance to populate
                        if albumArtUrl.isEmpty && self.pollsSinceTrackChange < 6 {
                            print("⏳ [POLL] No album art yet (poll \(self.pollsSinceTrackChange)/6) - waiting for Last.fm")
                        }

                        print("🖼️ [POLL] Album art URL: \(albumArtUrl.isEmpty ? "NONE" : albumArtUrl)")

                        // Update lock screen metadata on main thread
                        DispatchQueue.main.async {
                            print("📝 [MAIN THREAD] Updating lock screen metadata...")
                            self.updateLockScreenMetadata(
                                title: track,
                                artist: artist,
                                album: album,
                                albumArtUrl: albumArtUrl
                            )

                            // Notify JavaScript layer about the track change
                            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                            print("📡 [NOTIFY JS] Sending trackChanged event to JavaScript")
                            print("   Artist: \(artist)")
                            print("   Track: \(track)")
                            print("   Album: \(album)")
                            print("   Album Art: \(albumArtUrl.isEmpty ? "NONE" : albumArtUrl)")
                            print("   Thread: \(Thread.isMainThread ? "MAIN" : "BACKGROUND")")

                            let eventData: [String: Any] = [
                                "artist": artist,
                                "track": track,
                                "album": album,
                                "albumArt": albumArtUrl
                            ]

                            self.notifyListeners("trackChanged", data: eventData)
                            print("✅ [NOTIFY JS] notifyListeners() called successfully")
                            print("   Event name: trackChanged")
                            print("   Data sent: \(eventData)")
                            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                        }
                    } else {
                        self.pollsSinceTrackChange += 1
                        print("ℹ️ [POLL] No track change - same track playing (poll \(self.pollsSinceTrackChange))")

                        // Check if Last.fm album art became available
                        var albumArtUrl = ""
                        if let albumArt = nowPlaying["albumArt"] as? String {
                            albumArtUrl = albumArt
                        } else if let lastfmUrls = nowPlaying["lastfm_urls"] as? [String: Any] {
                            albumArtUrl = lastfmUrls["large_image"] as? String ??
                                         lastfmUrls["med_image"] as? String ??
                                         lastfmUrls["sm_image"] as? String ?? ""
                        }

                        // Update if album art became available
                        if !albumArtUrl.isEmpty {
                            print("🎨 [POLL] Album art became available - updating lock screen")
                            DispatchQueue.main.async {
                                if let artist = nowPlaying["artist"] as? String,
                                   let track = nowPlaying["track"] as? String {
                                    let album = nowPlaying["album"] as? String ??
                                               nowPlaying["release"] as? String ?? ""

                                    self.updateLockScreenMetadata(
                                        title: track,
                                        artist: artist,
                                        album: album,
                                        albumArtUrl: albumArtUrl
                                    )

                                    // Notify JavaScript layer
                                    let eventData: [String: Any] = [
                                        "artist": artist,
                                        "track": track,
                                        "album": album,
                                        "albumArt": albumArtUrl
                                    ]
                                    self.notifyListeners("trackChanged", data: eventData)
                                    print("✅ [NOTIFY JS] Album art update sent to JavaScript")
                                }
                            }
                        }

                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                    }
                } else {
                    print("❌ [POLL] Failed to parse now_playing from JSON")
                }
            } catch {
                print("❌ [POLL PARSE ERROR] \(error.localizedDescription)")
                print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            }
        }

        task.resume()
        print("✅ [POLL] URL task started (resumed)")
    }

    private func updateLockScreenMetadata(title: String, artist: String, album: String, albumArtUrl: String) {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("📝 [LOCK SCREEN UPDATE START]")
        print("   Title: \(title)")
        print("   Artist: \(artist)")
        print("   Album: \(album)")
        print("   Album Art URL: \(albumArtUrl.isEmpty ? "NONE" : albumArtUrl)")
        print("   Is Playing: \(isPlaying)")
        print("   Thread: \(Thread.isMainThread ? "MAIN" : "BACKGROUND")")

        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = title
        nowPlayingInfo[MPMediaItemPropertyArtist] = artist
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = album
        nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = true
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0

        // Load album art if provided
        if !albumArtUrl.isEmpty, let url = URL(string: albumArtUrl) {
            // Check cache first (thread-safe)
            if let cachedImage = getCachedImage(for: albumArtUrl) {
                print("🎯 [LOCK SCREEN] Using cached album art for: \(albumArtUrl)")
                let artwork = MPMediaItemArtwork(boundsSize: cachedImage.size) { _ in cachedImage }
                nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork

                // Set metadata WITH artwork in one update (no blip)
                DispatchQueue.main.async {
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                    print("✅ [LOCK SCREEN] Set metadata WITH cached artwork (single update)")
                    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                }
                return
            }

            print("🖼️ [LOCK SCREEN] Loading album art from: \(albumArtUrl)")
            let artStartTime = Date()

            // Create URLSession with timeout for cellular reliability
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 15.0 // 15 second timeout
            config.timeoutIntervalForResource = 30.0
            config.waitsForConnectivity = false // Don't wait if offline
            let session = URLSession(configuration: config)

            session.dataTask(with: url) { [weak self] data, response, error in
                guard let self = self else { return }

                let artDuration = Date().timeIntervalSince(artStartTime)
                print("⏱️ [LOCK SCREEN] Album art fetch completed in \(String(format: "%.2f", artDuration))s")

                if let error = error {
                    print("❌ [LOCK SCREEN] Error loading album art: \(error.localizedDescription)")
                    print("   Error code: \((error as NSError).code)")
                    // Set metadata with fallback CHIRP logo
                    if let fallback = self.fallbackAlbumArt {
                        nowPlayingInfo[MPMediaItemPropertyArtwork] = fallback
                        print("🎨 [LOCK SCREEN] Using fallback CHIRP logo for album art")
                    }
                    DispatchQueue.main.async {
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                        print("✅ [LOCK SCREEN] Set metadata with fallback artwork (load failed)")
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                    }
                    return
                }

                if let data = data, let image = UIImage(data: data) {
                    print("✅ [LOCK SCREEN] Album art loaded: \(image.size.width)x\(image.size.height), \(data.count) bytes")

                    // Cache the image for future use (thread-safe)
                    self.cacheImage(image, for: albumArtUrl)
                    print("💾 [LOCK SCREEN] Cached album art")

                    let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork

                    // Set metadata WITH artwork in one update (no blip)
                    DispatchQueue.main.async {
                        print("📱 [LOCK SCREEN] Setting metadata WITH artwork (single update)")
                        print("   App state: \(UIApplication.shared.applicationState.rawValue)")
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                        print("✅ [LOCK SCREEN] Set WITH artwork")
                        print("   Verify: \(MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String ?? "NIL")")
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                    }
                } else {
                    print("⚠️ [LOCK SCREEN] Failed to create UIImage from data")
                    print("   Data size: \(data?.count ?? 0) bytes")
                    print("   Response: \(response.debugDescription)")
                    // Set metadata with fallback CHIRP logo
                    if let fallback = self.fallbackAlbumArt {
                        nowPlayingInfo[MPMediaItemPropertyArtwork] = fallback
                        print("🎨 [LOCK SCREEN] Using fallback CHIRP logo for album art")
                    }
                    DispatchQueue.main.async {
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                        print("✅ [LOCK SCREEN] Set metadata with fallback artwork (image creation failed)")
                        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                    }
                }
            }.resume()
        } else {
            // No album art URL - use fallback CHIRP logo
            if let fallback = fallbackAlbumArt {
                nowPlayingInfo[MPMediaItemPropertyArtwork] = fallback
                print("🎨 [LOCK SCREEN] Using fallback CHIRP logo (no URL provided)")
            }
            DispatchQueue.main.async {
                print("📱 [LOCK SCREEN] Setting metadata with fallback artwork (no URL)")
                print("   App state: \(UIApplication.shared.applicationState.rawValue)")
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                print("✅ [LOCK SCREEN] Set metadata with fallback artwork")
                print("   Verify: \(MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String ?? "NIL")")
                print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            }
        }
    }
}
