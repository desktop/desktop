import Foundation

/// Onboarding tutorial step. Port of `models/tutorial-step.ts`.
///
/// Scope note (Docs/02-architecture.md §5): the original `PickEditor` step
/// (external editors are deleted) and `OpenPullRequest` step (GitHub PRs are
/// deleted) are retained here as data for a faithful foundation port, but
/// Task 9 replaces them: PickEditor is removed and OpenPullRequest is
/// replaced by PushBranch-is-done.
public enum TutorialStep: String, Codable, Sendable {
    case notApplicable = "NotApplicable"
    case pickEditor = "PickEditor"
    case createBranch = "CreateBranch"
    case editFile = "EditFile"
    case makeCommit = "MakeCommit"
    case pushBranch = "PushBranch"
    case openPullRequest = "OpenPullRequest"
    case allDone = "AllDone"
    case paused = "Paused"
    case announced = "Announced"
}

public func isValidTutorialStep(_ step: TutorialStep) -> Bool {
    step != .notApplicable && step != .paused
}

public let orderedTutorialSteps: [TutorialStep] = [
    .pickEditor,
    .createBranch,
    .editFile,
    .makeCommit,
    .pushBranch,
    .openPullRequest,
    .allDone,
    .announced,
]
