import Foundation

/// Collection of configurable settings regarding how the user may work with a repository.
/// Direct port of `electron/app/src/models/workflow-preferences.ts`.
/// GitHub fork-contribution target is retained as inert data only;
/// there is no GitHub integration (see AGENTS.md scope).
public enum ForkContributionTarget: String, Codable, Sendable {
    case parent = "parent"
    case `self` = "self"
}

public struct WorkflowPreferences: Codable, Sendable, Equatable {
    public var forkContributionTarget: ForkContributionTarget?

    public init(forkContributionTarget: ForkContributionTarget? = nil) {
        self.forkContributionTarget = forkContributionTarget
    }
}
