import Combine
import Foundation

// MARK: - AppState
// Port of the Task-1 subset of `IAppState` + `PossibleSelections` +
// `Foldout` + `PopupManager` from the reference app
// (`lib/app-state.ts`, `lib/popup-manager.ts`).
// Only the selection/popup/foldout/banner/width actions exist here;
// feature actions land in their owning tasks.

/// What is currently selected in the sidebar.
public enum AppSelection: Sendable, Equatable {
    case repository(RepositoryState)
    case cloning(CloningRepository)
    case missing(Repository)
}

/// One-open popover. Port of `Foldout`.
public enum Foldout: Sendable, Equatable {
    case repository
    case branch
    case appMenu
    case addMenu
    case pushPull
    case worktree
}

/// A pane width with min/max constraints. Port of `IConstrainedValue`.
public struct ConstrainedWidth: Codable, Sendable, Equatable {
    public var value: Double
    public var min: Double
    public var max: Double

    public init(value: Double, min: Double, max: Double) {
        self.value = value
        self.min = min
        self.max = max
    }

    public var clamped: Double { Swift.min(max, Swift.max(min, value)) }
}

/// Resizable pane widths (persisted via `Defaults`).
public struct PaneWidths: Sendable, Equatable {
    public var sidebar: ConstrainedWidth
    public var commitSummary: ConstrainedWidth
    public var stashedFiles: ConstrainedWidth
    public var branchDropdown: ConstrainedWidth
    public var worktreeDropdown: ConstrainedWidth
    public var pushPullButton: ConstrainedWidth

    public init(
        sidebar: ConstrainedWidth = ConstrainedWidth(value: 250, min: 180, max: 500),
        commitSummary: ConstrainedWidth = ConstrainedWidth(value: 250, min: 180, max: 500),
        stashedFiles: ConstrainedWidth = ConstrainedWidth(value: 250, min: 180, max: 500),
        branchDropdown: ConstrainedWidth = ConstrainedWidth(value: 300, min: 200, max: 600),
        worktreeDropdown: ConstrainedWidth = ConstrainedWidth(value: 300, min: 200, max: 600),
        pushPullButton: ConstrainedWidth = ConstrainedWidth(value: 200, min: 120, max: 400)
    ) {
        self.sidebar = sidebar
        self.commitSummary = commitSummary
        self.stashedFiles = stashedFiles
        self.branchDropdown = branchDropdown
        self.worktreeDropdown = worktreeDropdown
        self.pushPullButton = pushPullButton
    }
}

/// App-wide store. Mirrors the Task-1 slice of the reference `AppStore`:
/// repositories + selection + popup stack + foldout + banner + widths.
@MainActor
public final class AppStore: ObservableObject {
    @Published public private(set) var repositories: [Repository] = []
    @Published public private(set) var recentRepositoryIDs: [Int] = []
    @Published public private(set) var selection: AppSelection?
    @Published public private(set) var currentPopup: Popup?
    @Published public private(set) var allPopups: [Popup] = []
    @Published public private(set) var currentFoldout: Foldout?
    @Published public private(set) var currentBanner: Banner?
    @Published public var widths = PaneWidths()

    /// Per-repository state cache keyed by repository `hash`
    /// (mirrors `RepositoryStateCache`).
    public var repositoryStates: [String: RepositoryState] = [:]

    public static let popupStackLimit = 50

    public init() {}

    // MARK: - Repositories

    public var selectedRepository: Repository? {
        switch selection {
        case .repository(let state): return state.repository
        case .missing(let repository): return repository
        case .cloning: return nil
        case .none: return nil
        }
    }

    public var selectedState: RepositoryState? {
        if case .repository(let state) = selection { return state }
        return nil
    }

    public func setRepositories(_ repositories: [Repository]) {
        self.repositories = repositories
    }

    public func selectRepository(_ repository: Repository) {
        if let state = repositoryStates[repository.hash] {
            selection = .repository(state)
        } else {
            let state = RepositoryState(repository: repository)
            repositoryStates[repository.hash] = state
            selection = .repository(state)
        }
        pushRecent(repository.id)
    }

    public func updateRepositoryState(_ state: RepositoryState) {
        repositoryStates[state.repository.hash] = state
        if case .repository(let current) = selection,
           current.repository.hash == state.repository.hash {
            selection = .repository(state)
        }
    }

    private func pushRecent(_ id: Int) {
        var recent = recentRepositoryIDs.filter { $0 != id }
        recent.insert(id, at: 0)
        recentRepositoryIDs = Array(recent.prefix(3))
    }

    // MARK: - Popups (mirrors `PopupManager`)

    /// Show a popup. One per type except `.error`, which always stacks on top.
    /// Caps the stack at 50 (evicts the oldest non-error).
    public func showPopup(_ popup: Popup) {
        if case .error = popup {
            allPopups.append(popup)
        } else if allPopups.contains(where: { $0.type == popup.type }) {
            return // dedupe: one popup per type
        } else {
            // Non-errors insert before leading errors so errors stay on top.
            if let firstError = allPopups.firstIndex(where: {
                if case .error = $0 { return true }
                return false
            }) {
                allPopups.insert(popup, at: firstError)
            } else {
                allPopups.append(popup)
            }
        }
        enforceStackLimit()
        currentPopup = allPopups.last
    }

    public func closePopup(_ popup: Popup) {
        // Value equality: non-errors are unique per type; errors carrying
        // the same message collapse together (acceptable for Task 1; Task 2
        // introduces numeric popup IDs for full stacking fidelity).
        allPopups.removeAll { $0 == popup }
        currentPopup = allPopups.last
    }

    public func closePopup(ofType type: PopupType) {
        allPopups.removeAll { $0.type == type }
        currentPopup = allPopups.last
    }

    public func closeAllPopups() {
        allPopups.removeAll()
        currentPopup = nil
    }

    private func enforceStackLimit() {
        while allPopups.count > Self.popupStackLimit {
            if let index = allPopups.firstIndex(where: {
                if case .error = $0 { return false }
                return true
            }) {
                allPopups.remove(at: index)
            } else {
                allPopups.removeFirst()
            }
        }
    }

    // MARK: - Foldouts (one-open)

    public func showFoldout(_ foldout: Foldout) {
        currentFoldout = foldout
    }

    public func closeFoldout() {
        currentFoldout = nil
    }

    public func toggleFoldout(_ foldout: Foldout) {
        currentFoldout = (currentFoldout == foldout) ? nil : foldout
    }

    // MARK: - Banners

    public func setBanner(_ banner: Banner) {
        currentBanner = banner
    }

    public func clearBanner() {
        currentBanner = nil
    }

    // MARK: - Task 2 shell actions (additive)

    /// Add repositories, optionally selecting the first. Task 9 owns
    /// persistence/dedup; this is the in-memory shell seam for the repo list.
    public func addRepositories(_ repos: [Repository], selectFirst: Bool = true) {
        var merged = repositories
        for repo in repos where !merged.contains(where: { $0.id == repo.id }) {
            merged.append(repo)
        }
        repositories = merged
        if selectFirst, let first = repos.first,
           let match = merged.first(where: { $0.id == first.id }) {
            selectRepository(match)
        }
    }

    /// Remove a repository from the list and drop its cached state.
    /// Clears the selection when the selected repository is removed.
    public func removeRepository(_ repository: Repository) {
        repositories.removeAll { $0.id == repository.id }
        repositoryStates.removeValue(forKey: repository.hash)
        if case .repository(let state) = selection,
           state.repository.id == repository.id {
            if let next = repositories.first {
                selectRepository(next)
            } else {
                selection = nil
            }
        }
        if case .missing(let missing) = selection,
           missing.id == repository.id {
            selection = repositories.first.map { selectAndReturn($0) } ?? nil
        }
    }

    /// Set (or clear) a repository alias. Re-keys the state cache since
    /// `Repository.hash` includes the alias.
    public func setAlias(_ alias: String?, for repository: Repository) {
        guard let index = repositories.firstIndex(where: { $0.id == repository.id }) else { return }
        var updated = repositories[index]
        let trimmed = alias?.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.alias = (trimmed?.isEmpty == false) ? trimmed : nil
        repositories[index] = updated
        if let state = repositoryStates.removeValue(forKey: repository.hash) {
            var migrated = state
            migrated.repository = updated
            repositoryStates[updated.hash] = migrated
            if case .repository(let current) = selection,
               current.repository.id == repository.id {
                selection = .repository(migrated)
            }
        }
    }

    private func selectAndReturn(_ repository: Repository) -> AppSelection {
        selectRepository(repository)
        // selectRepository always sets `.repository` for a plain Repository.
        return selection ?? .missing(repository)
    }
}
