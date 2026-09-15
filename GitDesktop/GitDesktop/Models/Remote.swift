import Foundation

/// Magic remote-name prefix for Desktop-created fork remotes.
/// Port of `ForkedRemotePrefix` in `models/remote.ts`.
public let forkedRemotePrefix = "github-desktop-"

/// A remote as defined in Git. Port of `IRemote`.
public struct Remote: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var name: String
    public var url: String

    public init(name: String, url: String) {
        self.name = name
        self.url = url
    }

    public var id: String { name }
}

public func remoteEquals(_ x: Remote?, _ y: Remote?) -> Bool {
    switch (x, y) {
    case (nil, nil): return true
    case (nil, _), (_, nil): return false
    case (let a?, let b?): return a.name == b.name && a.url == b.url
    }
}
