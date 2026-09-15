import Foundation

// MARK: - ShellTests
// Task 2 unit tests for the shell's pure logic (grouping, push/pull state
// machine, banner copy, popup descriptors). Same harness style as
// `ParserTests`: no test framework so this compiles inside the app target;
// `runAll()` returns the failure count.

public enum ShellTests {
    public struct Failure: Sendable {
        public var test: String
        public var message: String
    }

    private static func check(_ condition: Bool, _ message: String, test: String, failures: inout [Failure]) {
        if !condition {
            failures.append(Failure(test: test, message: message))
        }
    }

    @discardableResult
    public static func runAll() -> Int {
        var failures: [Failure] = []
        testPushPullStateMachine(&failures)
        testBranchButtonState(&failures)
        testAheadBehindBadge(&failures)
        testRepoGrouping(&failures)
        testRepoTooltip(&failures)
        testBannerMessages(&failures)
        testPopupDescriptors(&failures)

        if failures.isEmpty {
            print("ShellTests: all tests passed")
        } else {
            print("ShellTests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    // MARK: - Fixtures

    private static func branch(named name: String) -> Branch {
        Branch(
            name: name, upstream: "origin/\(name)",
            tip: BranchTip(sha: "abc1234567890"),
            type: .local, ref: "refs/heads/\(name)")
    }

    private static func repo(id: Int, path: String, alias: String? = nil, missing: Bool = false) -> Repository {
        Repository(path: path, id: id, missing: missing, alias: alias)
    }

    // MARK: - Push/pull state machine

    static func testPushPullStateMachine(_ failures: inout [Failure]) {
        let test = "push-pull"
        let tip = Tip.valid(branch: branch(named: "main"))

        var state = derivePushPullState(tip: tip, remoteName: nil, aheadBehind: nil)
        check(state.action == .publishRepository, "no remote → publish repository, got \(state.action)", test: test, failures: &failures)

        state = derivePushPullState(tip: tip, remoteName: "origin", aheadBehind: nil)
        check(state.action == .publishBranch, "no upstream → publish branch, got \(state.action)", test: test, failures: &failures)
        check(state.showsSplitMenu, "publish branch shows split menu", test: test, failures: &failures)

        state = derivePushPullState(
            tip: tip, remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 0, behind: 0))
        check(state.action == .fetch(remote: "origin"), "up-to-date → fetch, got \(state.action)", test: test, failures: &failures)
        check(!state.showsSplitMenu, "fetch hides split menu", test: test, failures: &failures)

        state = derivePushPullState(
            tip: tip, remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 0, behind: 3))
        check(state.action == .pull(remote: "origin", rebase: false), "behind → pull, got \(state.action)", test: test, failures: &failures)
        check(state.showsForcePushMenuItem, "pull offers force push", test: test, failures: &failures)

        state = derivePushPullState(
            tip: tip, remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 0, behind: 3), pullWithRebase: true)
        check(state.action == .pull(remote: "origin", rebase: true), "pull respects rebase backend", test: test, failures: &failures)

        state = derivePushPullState(
            tip: tip, remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 2, behind: 0))
        check(state.action == .push(remote: "origin"), "ahead → push, got \(state.action)", test: test, failures: &failures)

        state = derivePushPullState(
            tip: tip, remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 2, behind: 0), forcePushRecommended: true)
        check(state.action == .forcePush(remote: "origin"), "recommended → force push, got \(state.action)", test: test, failures: &failures)

        state = derivePushPullState(
            tip: .detached(currentSha: "abc1234"), remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 1, behind: 0))
        check(state.action == .detached(rebaseInProgress: false), "detached, got \(state.action)", test: test, failures: &failures)
        check(!state.isEnabled, "detached disables button", test: test, failures: &failures)

        state = derivePushPullState(
            tip: .unborn(ref: "refs/heads/main"), remoteName: "origin", aheadBehind: nil)
        check(state.action == .fetch(remote: "origin"), "unborn → fetch, got \(state.action)", test: test, failures: &failures)

        state = derivePushPullState(tip: tip, remoteName: "origin", aheadBehind: nil, progressTitle: "Pushing…")
        check(state.action == .progress(title: "Pushing…"), "progress wins, got \(state.action)", test: test, failures: &failures)
        check(!state.isEnabled, "progress disables button", test: test, failures: &failures)
    }

    // MARK: - Branch button

    static func testBranchButtonState(_ failures: inout [Failure]) {
        let test = "branch-button"
        var state = deriveBranchButtonState(tip: .valid(branch: branch(named: "main")))
        check(state.title == "main" && state.detail == "Current Branch", "valid \(state)", test: test, failures: &failures)
        check(state.isEnabled, "valid enabled", test: test, failures: &failures)

        state = deriveBranchButtonState(tip: .detached(currentSha: "abc1234567890"))
        check(state.title == "Detached HEAD", "detached title", test: test, failures: &failures)
        check(state.detail.contains("abc1234"), "detached shows short sha: \(state.detail)", test: test, failures: &failures)

        state = deriveBranchButtonState(tip: .unborn(ref: "refs/heads/feature"))
        check(state.title == "feature", "unborn strips ref prefix: \(state.title)", test: test, failures: &failures)

        state = deriveBranchButtonState(tip: .unknown)
        check(!state.isEnabled, "unknown disabled", test: test, failures: &failures)

        state = deriveBranchButtonState(tip: .valid(branch: branch(named: "main")), inProgressDescription: "Rebasing")
        check(state.detail == "Rebasing", "progress description wins", test: test, failures: &failures)
    }

    // MARK: - Badge

    static func testAheadBehindBadge(_ failures: inout [Failure]) {
        let test = "badge"
        check(aheadBehindBadgeText(ahead: 0, behind: 0) == nil, "clean → nil", test: test, failures: &failures)
        check(aheadBehindBadgeText(ahead: 2, behind: 1) == "↑2 ↓1", "both", test: test, failures: &failures)
        check(aheadBehindBadgeText(ahead: 0, behind: 4) == "↓4", "behind only", test: test, failures: &failures)
        check(aheadBehindBadgeText(ahead: 1, behind: 0, tagsToPush: 2) == "↑3", "tags fold into up", test: test, failures: &failures)
    }

    // MARK: - Grouping

    static func testRepoGrouping(_ failures: inout [Failure]) {
        let test = "grouping"
        let repos = [
            repo(id: 1, path: "/code/beta"),
            repo(id: 2, path: "/code/alpha", alias: "Alpha site"),
            repo(id: 3, path: "/code/gamma"),
        ]
        var sections = groupRepositoriesForList(repositories: repos, recentIDs: [3, 1], filter: "")
        check(sections.count == 2, "recent + other, got \(sections.count)", test: test, failures: &failures)
        check(sections.first?.title == "Recent", "recent first", test: test, failures: &failures)
        check(sections.first?.repositories.map(\.id) == [3, 1], "recent honors order", test: test, failures: &failures)
        check(sections.last?.repositories.map(\.id) == [2], "other holds the rest", test: test, failures: &failures)

        sections = groupRepositoriesForList(repositories: repos, recentIDs: [], filter: "")
        check(sections.count == 1 && sections.first?.title == "Other", "no recents → other only", test: test, failures: &failures)
        check(sections.first?.repositories.map(\.id) == [2, 1, 3], "other sorted by name", test: test, failures: &failures)

        sections = groupRepositoriesForList(repositories: repos, recentIDs: [3, 1], filter: "alpha")
        check(sections.flatMap(\.repositories).map(\.id) == [2], "name filter", test: test, failures: &failures)

        sections = groupRepositoriesForList(repositories: repos, recentIDs: [], filter: "ALPHA SITE")
        check(sections.flatMap(\.repositories).map(\.id) == [2], "alias filter is case-insensitive", test: test, failures: &failures)

        sections = groupRepositoriesForList(repositories: repos, recentIDs: [], filter: "/code/gamma")
        check(sections.flatMap(\.repositories).map(\.id) == [3], "path filter", test: test, failures: &failures)

        sections = groupRepositoriesForList(repositories: repos, recentIDs: [], filter: "nope")
        check(sections.isEmpty, "no match → no sections", test: test, failures: &failures)
    }

    // MARK: - Tooltip

    static func testRepoTooltip(_ failures: inout [Failure]) {
        let test = "tooltip"
        let tooltip = repositoryRowTooltip(
            repository: repo(id: 1, path: "/code/beta"),
            aheadBehind: AheadBehind(ahead: 2, behind: 1),
            changedFilesCount: 3)
        check(tooltip.contains("beta"), "name", test: test, failures: &failures)
        check(tooltip.contains("/code/beta"), "path", test: test, failures: &failures)
        check(tooltip.contains("2 ahead") && tooltip.contains("1 behind"), "sync: \(tooltip)", test: test, failures: &failures)
        check(tooltip.contains("uncommitted changes"), "dirty", test: test, failures: &failures)

        let clean = repositoryRowTooltip(
            repository: repo(id: 2, path: "/code/alpha", alias: "Alpha site"),
            aheadBehind: AheadBehind(ahead: 0, behind: 0),
            changedFilesCount: 0)
        check(clean.contains("Alpha site"), "alias shown: \(clean)", test: test, failures: &failures)
        check(!clean.contains("uncommitted"), "clean omits dirty line", test: test, failures: &failures)
    }

    // MARK: - Banners

    static func testBannerMessages(_ failures: inout [Failure]) {
        let test = "banners"
        var content = describeBanner(.successfulMerge(ourBranch: "main", theirBranch: "feature"))
        check(content.message == "Successfully merged feature into main", "merge: \(content.message)", test: test, failures: &failures)
        check(content.tint == .success && content.autoDismisses, "merge success auto-dismisses", test: test, failures: &failures)
        check(content.action == .none, "merge has no action", test: test, failures: &failures)

        content = describeBanner(.mergeConflictsFound(ourBranch: "main", popup: .about))
        check(content.tint == .conflict && !content.autoDismisses, "conflicts persist", test: test, failures: &failures)
        check(content.action == .reopenConflictDialog, "conflicts reopen", test: test, failures: &failures)

        content = describeBanner(.branchAlreadyUpToDate(ourBranch: "main", theirBranch: "origin/main"))
        check(content.message.contains("origin/main"), "up-to-date names branch: \(content.message)", test: test, failures: &failures)

        content = describeBanner(.successfulCherryPick(targetBranchName: "main", count: 1, actionToken: UUID()))
        check(content.message.contains("1 commit") && !content.message.contains("1 commits"), "singular: \(content.message)", test: test, failures: &failures)
        check(content.action == .undo, "cherry-pick undo", test: test, failures: &failures)

        content = describeBanner(.successfulCherryPick(targetBranchName: "main", count: 3, actionToken: UUID()))
        check(content.message.contains("3 commits"), "plural: \(content.message)", test: test, failures: &failures)

        content = describeBanner(.osVersionNoLongerSupported)
        check(content.tint == .warning && !content.autoDismisses, "OS banner persists", test: test, failures: &failures)

        content = describeBanner(.successfulRebase(targetBranch: "feature", baseBranch: nil))
        check(content.message == "Successfully rebased feature", "rebase no base: \(content.message)", test: test, failures: &failures)
    }

    // MARK: - Popups

    static func testPopupDescriptors(_ failures: inout [Failure]) {
        let test = "popups"
        var descriptor = describePopup(.removeRepository(repositoryID: 1))
        check(descriptor.title == "Remove Repository" && descriptor.primaryTitle == "Remove", "remove", test: test, failures: &failures)
        check(descriptor.owningTask == nil, "remove owned by Task 2", test: test, failures: &failures)

        descriptor = describePopup(.changeRepositoryAlias(repositoryID: 1))
        check(descriptor.title == "Change Repository Alias", "alias", test: test, failures: &failures)

        descriptor = describePopup(.error(message: "boom"))
        check(descriptor.title == "Error" && descriptor.message == "boom", "error carries message", test: test, failures: &failures)
        check(!descriptor.showsCancel, "error dismiss-only", test: test, failures: &failures)

        descriptor = describePopup(.pushNeedsPull(repositoryID: 1))
        check(descriptor.owningTask == 7, "push-needs-pull → Task 7", test: test, failures: &failures)

        descriptor = describePopup(.preferences(initialTab: nil))
        check(descriptor.owningTask == 9, "prefs → Task 9", test: test, failures: &failures)

        descriptor = describePopup(.releaseNotes)
        check(descriptor.owningTask == 10, "release notes → Task 10", test: test, failures: &failures)

        descriptor = describePopup(.createTag(repositoryID: 1, targetCommitSHA: "abc", initialName: nil))
        check(descriptor.owningTask == 8, "tags → Task 8", test: test, failures: &failures)
    }
}
