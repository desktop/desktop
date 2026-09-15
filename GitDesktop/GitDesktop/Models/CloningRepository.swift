import Foundation

/// A repository currently being cloned. Port of `models/cloning-repository.ts`.
public struct CloningRepository: Sendable, Equatable, Identifiable {
    private static var nextID: Int = 1_000_000

    public var id: Int
    public var path: String
    public var url: String

    public init(path: String, url: String) {
        self.id = CloningRepository.nextID
        CloningRepository.nextID += 1
        self.path = path
        self.url = url
    }

    public var name: String {
        var base = (url as NSString).lastPathComponent
        if base.hasSuffix(".git") { base = String(base.dropLast(4)) }
        return base
    }

    public var hash: String { "\(id)+\(path)+\(url)" }
}
