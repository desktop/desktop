import Foundation

// MARK: - Defaults
// Task-1 subset of `local-storage.ts` + `app-store.ts` persisted keys:
// pane widths, confirmation prompts, and filter/display prefs only.
// Deleted per scope (never add): theme, date/number formats, OS notifications,
// editor/shell integration, Copilot, GitHub/stats keys.

public enum Defaults {
    // MARK: Pane widths
    public static let sidebarWidth = "sidebar-width"
    public static let commitSummaryWidth = "commit-summary-width"
    public static let stashedFilesWidth = "stashed-files-width"
    public static let branchDropdownWidth = "branch-dropdown-width"
    public static let worktreeDropdownWidth = "worktree-dropdown-width"
    public static let pushPullButtonWidth = "push-pull-button-width"

    // MARK: Confirmations
    public static let confirmRepoRemoval = "confirmRepoRemoval"
    public static let confirmDiscardChanges = "confirmDiscardChanges"
    public static let confirmDiscardChangesPermanently = "confirmDiscardChangesPermanentlyKey"
    public static let confirmDiscardStash = "confirmDiscardStash"
    public static let confirmCheckoutCommit = "confirmCheckoutCommit"
    public static let confirmForcePush = "confirmForcePush"
    public static let confirmUndoCommit = "confirmUndoCommit"
    public static let confirmCommitFilteredChanges = "confirmCommitFilteredChangesKey"
    public static let confirmWorktreeRemoval = "confirmWorktreeRemoval"

    // MARK: Uncommitted-changes strategy
    public static let uncommittedChangesStrategy = "uncommittedChangesStrategyKind"

    // MARK: Filters / display prefs
    public static let showChangesFilter = "show-changes-filter"
    public static let imageDiffType = "image-diff-type"
    public static let hideWhitespaceInChangesDiff = "hide-whitespace-in-changes-diff"
    public static let hideWhitespaceInHistoryDiff = "hide-whitespace-in-diff"
    public static let showSideBySideDiff = "show-side-by-side-diff"
    public static let tabSize = "tab-size"
    public static let commitSpellcheckEnabled = "commit-spellcheck-enabled"
    public static let underlineLinks = "underline-links"
    public static let showDiffCheckMarks = "diff-check-marks-visible"

    // MARK: Selection restore
    public static let lastSelectedRepositoryID = "last-selected-repository-id"
    public static let recentlySelectedRepositories = "recently-selected-repositories"

    // MARK: Task 9 — onboarding / settings / help
    public static let hasShownWelcomeFlow = "has-shown-welcome-flow"
    public static let optOutOfUsageTracking = "opt-out-of-usage-tracking"
    public static let useExternalCredentialHelper = "use-external-credential-helper"
    public static let repositoryIndicatorsEnabled = "repository-indicators-enabled"
    public static let showCommitLengthWarning = "show-commit-length-warning"
    public static let confirmCommitMessageOverride = "confirm-commit-message-override"
    public static let enableGitHookEnv = "enable-git-hook-env"
    public static let cacheGitHookEnv = "cache-git-hook-env"
    public static let gitHookEnvShell = "git-hook-env-shell"
    public static let defaultBranchName = "default-branch-name"
    public static let globalGitAuthorName = "global-git-author-name"
    public static let globalGitAuthorEmail = "global-git-author-email"
    public static let appleIntelligenceEnabled = "apple-intelligence-enabled"
    public static let appleIntelligenceDisclaimerAcknowledged = "apple-intelligence-disclaimer-acknowledged"
    public static let persistedRepositories = "persisted-repositories"
    public static let tutorialRepositoryPath = "tutorial-repository-path"

    // MARK: - Typed accessors

    public static func bool(_ key: String, default defaultValue: Bool, in store: UserDefaults = .standard) -> Bool {
        store.object(forKey: key) == nil ? defaultValue : store.bool(forKey: key)
    }

    public static func setBool(_ value: Bool, _ key: String, in store: UserDefaults = .standard) {
        store.set(value, forKey: key)
    }

    public static func integer(_ key: String, default defaultValue: Int, in store: UserDefaults = .standard) -> Int {
        store.object(forKey: key) == nil ? defaultValue : store.integer(forKey: key)
    }

    public static func setInteger(_ value: Int, _ key: String, in store: UserDefaults = .standard) {
        store.set(value, forKey: key)
    }

    public static func double(_ key: String, default defaultValue: Double, in store: UserDefaults = .standard) -> Double {
        store.object(forKey: key) == nil ? defaultValue : store.double(forKey: key)
    }

    public static func setDouble(_ value: Double, _ key: String, in store: UserDefaults = .standard) {
        store.set(value, forKey: key)
    }

    public static func recentIDs(in store: UserDefaults = .standard) -> [Int] {
        guard let csv = store.string(forKey: recentlySelectedRepositories) else { return [] }
        return csv.split(separator: ",").compactMap { Int($0) }
    }

    public static func setRecentIDs(_ ids: [Int], in store: UserDefaults = .standard) {
        store.set(ids.prefix(3).map(String.init).joined(separator: ","), forKey: recentlySelectedRepositories)
    }

    public static func strategy(in store: UserDefaults = .standard) -> UncommittedChangesStrategy {
        guard let raw = store.string(forKey: uncommittedChangesStrategy),
              let value = UncommittedChangesStrategy(rawValue: raw)
        else { return defaultUncommittedChangesStrategy }
        return value
    }

    public static func setStrategy(_ value: UncommittedChangesStrategy, in store: UserDefaults = .standard) {
        store.set(value.rawValue, forKey: uncommittedChangesStrategy)
    }
}
