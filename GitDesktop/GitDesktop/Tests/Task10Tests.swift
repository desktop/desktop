import Foundation

// MARK: - Task10Tests
// Pure-function tests for Task 10 (menus/shortcuts, Sparkle states,
// crash reporter payload, Apple Intelligence prompt/gate).
// Same harness style as Task9Tests: no test bundle needed.

public enum Task10Tests {
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
        testMenuInventory(&failures)
        testMenuActionRoundtrip(&failures)
        testPaneResize(&failures)
        testVersionCompare(&failures)
        testAppcast(&failures)
        testAIPrompt(&failures)
        testAISplit(&failures)
        testAIGates(&failures)
        testCrashPayload(&failures)
        if failures.isEmpty {
            print("Task10Tests: all tests passed")
        } else {
            print("Task10Tests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    static func testMenuInventory(_ failures: inout [Failure]) {
        let test = "menu-inventory"
        for id in ["new-repository", "show-changes", "show-history", "push", "pull", "fetch",
                   "create-branch", "merge-branch", "rebase-branch", "check-for-updates"] {
            check(requiredMenuItemIDs.contains(id), "missing required id \(id)", test: test, failures: &failures)
        }
        for id in forbiddenMenuItemIDs {
            check(!requiredMenuItemIDs.contains(id), "forbidden id leaked: \(id)", test: test, failures: &failures)
        }
        // No GH/editor/shell labels in the required set.
        let joined = requiredMenuItemIDs.joined(separator: ",")
        check(!joined.contains("github"), "github id leaked", test: test, failures: &failures)
        check(!joined.contains("pull-request"), "PR id leaked", test: test, failures: &failures)
        check(!joined.contains("external-editor"), "editor id leaked", test: test, failures: &failures)
        check(!joined.contains("open-in-shell"), "shell id leaked", test: test, failures: &failures)
        // Accelerators cover the headline shortcuts.
        let accIDs = Set(requiredMenuAccelerators.map(\.id))
        for id in ["new-repository", "show-changes", "push", "pull", "create-branch", "find", "select-all"] {
            check(accIDs.contains(id), "missing accelerator \(id)", test: test, failures: &failures)
        }
    }

    static func testMenuActionRoundtrip(_ failures: inout [Failure]) {
        let test = "menu-action"
        for action in [GitDesktopMenuAction.showChanges, .push, .findInDiff, .rebaseCurrent] {
            let note = action.notification
            check(GitDesktopMenuAction.from(note) == action, "roundtrip \(action)", test: test, failures: &failures)
        }
        check(GitDesktopMenuAction.from(Notification(name: .gitDesktopMenuAction)) == nil, "nil userInfo", test: test, failures: &failures)
    }

    static func testPaneResize(_ failures: inout [Failure]) {
        let test = "pane-resize"
        let base = ConstrainedWidth(value: 250, min: 180, max: 500)
        check(adjustedPaneWidth(base, by: 5).value == 255, "step", test: test, failures: &failures)
        check(adjustedPaneWidth(base, by: -500).value == 180, "clamp min", test: test, failures: &failures)
        check(adjustedPaneWidth(base, by: 500).value == 500, "clamp max", test: test, failures: &failures)
        check(paneResizeStep == 5, "step const", test: test, failures: &failures)
    }

    static func testVersionCompare(_ failures: inout [Failure]) {
        let test = "version-compare"
        check(isVersion("1.2.10", newerThan: "1.2.9") == true, "patch", test: test, failures: &failures)
        check(isVersion("2.0", newerThan: "1.9.9") == true, "minor", test: test, failures: &failures)
        check(isVersion("1.2.3", newerThan: "1.2.3") == false, "equal", test: test, failures: &failures)
        check(isVersion("1.2.3", newerThan: "1.2.4") == false, "older", test: test, failures: &failures)
        check(isVersion("1.10", newerThan: "1.9") == true, "numeric not lexical", test: test, failures: &failures)
    }

    static func testAppcast(_ failures: inout [Failure]) {
        let test = "appcast"
        let xml = """
        <rss><channel>
        <item><enclosure sparkle:version="1.2.9" /></item>
        <item><enclosure sparkle:version="1.2.10" /></item>
        <item><enclosure sparkle:version="1.2.3" /></item>
        </channel></rss>
        """
        check(newestVersionInAppcast(xml, current: "1.2.9") == "1.2.10", "newest", test: test, failures: &failures)
        check(newestVersionInAppcast(xml, current: "1.2.10") == nil, "up-to-date", test: test, failures: &failures)
        check(newestVersionInAppcast("no enclosures", current: "1.0") == nil, "empty", test: test, failures: &failures)
    }

    static func testAIPrompt(_ failures: inout [Failure]) {
        let test = "ai-prompt"
        let ctx = AIDiffContext(
            stagedFileNames: ["Sources/App.swift", "README.md"],
            diffStat: "2 files changed, 10 insertions(+)",
            recentSummaries: ["Add engine"],
            branchName: "feature/x")
        let prompt = buildCommitMessagePrompt(context: ctx)
        check(prompt.contains("feature/x"), "branch", test: test, failures: &failures)
        check(prompt.contains("Sources/App.swift"), "files", test: test, failures: &failures)
        check(prompt.contains("72"), "72-char rule", test: test, failures: &failures)
        check(prompt.contains("ONLY the commit message"), "only-message", test: test, failures: &failures)
        let long = String(repeating: "x\n", count: 5000)
        check(truncateDiffForPrompt(long, limit: 4000).count <= 4000, "truncate", test: test, failures: &failures)
        check(truncateDiffForPrompt("short") == "short", "short passthrough", test: test, failures: &failures)
    }

    static func testAISplit(_ failures: inout [Failure]) {
        let test = "ai-split"
        let parts = splitGeneratedMessage("Add engine\n\nBody here\nmore")
        check(parts.summary == "Add engine", "summary \(parts.summary)", test: test, failures: &failures)
        check(parts.body.contains("Body here"), "body", test: test, failures: &failures)
        let empty = splitGeneratedMessage("   ")
        check(empty.summary.isEmpty && empty.body.isEmpty, "empty", test: test, failures: &failures)
        let quoted = splitGeneratedMessage("\"Add engine\"\n\nBody")
        check(quoted.summary == "Add engine", "quotes stripped: \(quoted.summary)", test: test, failures: &failures)
    }

    static func testAIGates(_ failures: inout [Failure]) {
        let test = "ai-gates"
        check(appleIntelligenceAvailability(enabledInSettings: false, osSupportsModel: true).isAvailable == false, "toggle off", test: test, failures: &failures)
        if case .unsupportedOS = appleIntelligenceAvailability(enabledInSettings: true, osSupportsModel: false) {
        } else {
            check(false, "old os gates to unsupportedOS", test: test, failures: &failures)
        }
        check(appleIntelligenceAvailability(enabledInSettings: true, osSupportsModel: true).isAvailable == true, "on", test: test, failures: &failures)
        check(aiShouldWarnBeforeOverwrite(summary: "x", description: "") == true, "summary warn", test: test, failures: &failures)
        check(aiShouldWarnBeforeOverwrite(summary: "", description: "") == false, "clean no warn", test: test, failures: &failures)
        check(aiShouldShowDisclaimer(acknowledged: false, dontAskAgain: false) == true, "first run", test: test, failures: &failures)
        check(aiShouldShowDisclaimer(acknowledged: true, dontAskAgain: false) == false, "acked", test: test, failures: &failures)
        check(aiShouldShowDisclaimer(acknowledged: false, dontAskAgain: true) == false, "dont ask", test: test, failures: &failures)
        check(!AIAvailability.available.statusText.isEmpty, "status text", test: test, failures: &failures)
    }

    static func testCrashPayload(_ failures: inout [Failure]) {
        let test = "crash-payload"
        let report = buildCrashReport(
            error: "boom",
            callStack: ["frame0", "frame1"],
            appVersion: "1.0",
            osVersion: "macOS 26",
            date: Date(timeIntervalSince1970: 0))
        check(report.contains("boom"), "error", test: test, failures: &failures)
        check(report.contains("frame0"), "stack", test: test, failures: &failures)
        check(report.contains("1.0"), "version", test: test, failures: &failures)
        check(crashReportFileName(date: Date(timeIntervalSince1970: 0)).hasSuffix(".crash"), "suffix", test: test, failures: &failures)
        check(crashReportDirectory(homeDirectory: URL(fileURLWithPath: "/Users/x")).path.hasSuffix("Library/Logs/GitDesktop/Crashes"), "dir", test: test, failures: &failures)
        let store = UserDefaults(suiteName: "Task10CrashTests")!
        store.removePersistentDomain(forName: "Task10CrashTests")
        check(isCrashReportingOptedIn(in: store) == false, "default off", test: test, failures: &failures)
        setCrashReportingOptedIn(true, in: store)
        check(isCrashReportingOptedIn(in: store) == true, "opt in", test: test, failures: &failures)
        store.removePersistentDomain(forName: "Task10CrashTests")
    }
}
