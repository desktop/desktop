import Combine
import Foundation

// MARK: - UpdateService (stub)
// Task 9 owns the `InstallingUpdate` (blocks quit) + `MoveToApplicationsFolder`
// + `CLIInstalled` surfaces; the Sparkle updater itself lands in Task 10.
// This stub models the states so Task 9 dialogs + quit-blocking compile.

public enum UpdateState: Sendable, Equatable {
    case upToDate
    case checking
    case available(version: String)
    case downloading(version: String, progress: Double)
    case installing(version: String)
    case installedPendingRestart(version: String)
}

public enum MoveToApplicationsStatus: Sendable, Equatable {
    case notNeeded
    case needed
    case moved
    case declined
}

@MainActor
public final class UpdateService: ObservableObject {
    @Published public private(set) var state: UpdateState = .upToDate
    @Published public private(set) var moveStatus: MoveToApplicationsStatus = .notNeeded

    public init() {}

    /// Whether quit is blocked (port of `InstallingUpdate` semantics).
    public var blocksQuit: Bool {
        switch state {
        case .downloading, .installing: return true
        default: return false
        }
    }

    public func checkForUpdates() {
        // Task 10 wires Sparkle; until then remain up-to-date.
        state = .upToDate
    }

    public func evaluateMoveToApplications(bundlePath: String = Bundle.main.bundlePath) {
        // Port of `MoveToApplicationsFolder`: prompt when running outside
        // /Applications (e.g. from Downloads).
        let apps = "/Applications/"
        if bundlePath.hasPrefix(apps) {
            moveStatus = .notNeeded
        } else if bundlePath.contains("/Downloads/") || !bundlePath.hasPrefix("/Applications") {
            // Only prompt for bundled builds, not dev builds in DerivedData.
            if bundlePath.contains(".app/Contents") && !bundlePath.contains("DerivedData") {
                moveStatus = .needed
            } else {
                moveStatus = .notNeeded
            }
        }
    }

    public func declineMove() { moveStatus = .declined }
    public func didMove() { moveStatus = .moved }

    // Test seam for Task 10.
    public func setStateForTesting(_ state: UpdateState) { self.state = state }
}
