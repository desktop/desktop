import Foundation

/// Strategy for handling uncommitted changes on branch switch.
/// Port of `models/uncommitted-changes-strategy.ts`.
public enum UncommittedChangesStrategy: String, Codable, Sendable {
    case askForConfirmation = "AskForConfirmation"
    case stashOnCurrentBranch = "StashOnCurrentBranch"
    case moveToNewBranch = "MoveToNewBranch"
}

public let defaultUncommittedChangesStrategy: UncommittedChangesStrategy = .askForConfirmation
