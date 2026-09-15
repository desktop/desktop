import Foundation

/// A submodule row. Port of `SubmoduleEntry`.
public struct SubmoduleEntry: Sendable, Equatable, Identifiable {
    public var sha: String
    public var path: String
    public var describe: String

    public init(sha: String, path: String, describe: String) {
        self.sha = sha
        self.path = path
        self.describe = describe
    }

    public var id: String { path }
}
