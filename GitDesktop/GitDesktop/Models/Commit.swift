import Foundation

/// A parsed `Name <email>` value. Port of `models/git-author.ts`.
public struct GitAuthor: Sendable, Equatable, Hashable {
    public var name: String
    public var email: String

    public init(name: String, email: String) {
        self.name = name
        self.email = email
    }

    /// Parses `"Name <email>"`. Returns nil when the pattern does not match.
    public static func parse(_ nameAddr: String) -> GitAuthor? {
        guard let lt = nameAddr.firstIndex(of: "<"),
              let gt = nameAddr[lt...].firstIndex(of: ">"),
              gt > nameAddr.index(after: lt)
        else { return nil }
        let name = String(nameAddr[..<lt]).trimmingCharacters(in: .whitespaces)
        let email = String(nameAddr[nameAddr.index(after: lt)..<gt])
        return GitAuthor(name: name, email: email)
    }

    public var description: String { "\(name) <\(email)>" }
}

/// A name/email/date tuple for a commit author or committer.
/// Port of `models/commit-identity.ts`.
public struct CommitIdentity: Sendable, Equatable, Hashable {
    public var name: String
    public var email: String
    public var date: Date
    /// Timezone offset in minutes east of UTC (parsed from `--date=raw`).
    public var tzOffset: Int

    public init(name: String, email: String, date: Date, tzOffset: Int = 0) {
        self.name = name
        self.email = email
        self.date = date
        self.tzOffset = tzOffset
    }

    public enum ParseError: Error, Equatable {
        case invalidFormat(String)
        case invalidDate(String)
    }

    /// Parses a raw git ident string: `NAME <EMAIL> UNIX_TS ±HHMM`.
    /// Mirrors `CommitIdentity.parseIdentity` (fmt_ident / `--date=raw`).
    public static func parseIdentity(_ identity: String) throws -> CommitIdentity {
        // ^(.*?) <(.*?)> (\d+) (\+|-)?(\d{2})(\d{2})
        let pattern = #"^(.*?) <(.*?)> (\d+) (\+|-)?(\d{2})(\d{2})"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(
                in: identity,
                range: NSRange(identity.startIndex..., in: identity)
              ),
              match.numberOfRanges == 7
        else {
            throw ParseError.invalidFormat(identity)
        }
        func group(_ i: Int) -> String? {
            let r = match.range(at: i)
            guard r.location != NSNotFound,
                  let range = Range(r, in: identity)
            else { return nil }
            return String(identity[range])
        }
        guard let name = group(1), let email = group(2), let ts = group(3),
              let hh = group(5), let mm = group(6),
              let seconds = TimeInterval(ts)
        else {
            throw ParseError.invalidFormat(identity)
        }
        let date = Date(timeIntervalSince1970: seconds)
        if date.timeIntervalSince1970.isNaN {
            throw ParseError.invalidDate(identity)
        }
        let sign = group(4) == "-" ? -1 : 1
        let tzMinutes = ((Int(hh) ?? 0) * 60 + (Int(mm) ?? 0)) * sign
        return CommitIdentity(name: name, email: email, date: date, tzOffset: tzMinutes)
    }

    public var description: String { "\(name) <\(email)>" }
}

/// A git commit-message trailer. Port of `ITrailer` in `lib/git/interpret-trailers.ts`.
public struct Trailer: Sendable, Equatable, Hashable {
    public var token: String
    public var value: String

    public init(token: String, value: String) {
        self.token = token
        self.value = value
    }

    public var isCoAuthoredBy: Bool { token.lowercased() == "co-authored-by" }
}

/// Grouping of information required to create a commit. Port of `ICommitContext`.
/// (`messageGeneratedByCopilot` deleted per scope; Task 10 adds
/// `generatedByAppleIntelligence` instead.)
public struct CommitContext: Sendable, Equatable {
    public var summary: String
    public var description: String?
    public var amend: Bool
    public var trailers: [Trailer]

    public init(
        summary: String,
        description: String? = nil,
        amend: Bool = false,
        trailers: [Trailer] = []
    ) {
        self.summary = summary
        self.description = description
        self.amend = amend
        self.trailers = trailers
    }
}

/// A commit message summary + description. Port of `ICommitMessage`.
/// (`generatedByCopilot` deleted per scope.)
public struct CommitMessage: Sendable, Equatable {
    public var summary: String
    public var description: String?
    /// Timestamp the message was created; used to keep the newest message.
    public var timestamp: TimeInterval
    /// Task 10 (Apple Intelligence) sets this when the message was generated on-device.
    public var generatedByAppleIntelligence: Bool

    public init(
        summary: String,
        description: String? = nil,
        timestamp: TimeInterval = 0,
        generatedByAppleIntelligence: Bool = false
    ) {
        self.summary = summary
        self.description = description
        self.timestamp = timestamp
        self.generatedByAppleIntelligence = generatedByAppleIntelligence
    }

    public static var `default`: CommitMessage {
        CommitMessage(summary: "", description: "", timestamp: 0)
    }
}

/// Returns the 7-char short SHA. Port of `shortenSHA`.
public func shortenSHA(_ sha: String) -> String {
    String(sha.prefix(7))
}

/// Minimal commit shape for list rows. Port of `CommitOneLine`.
public struct CommitOneLine: Sendable, Equatable, Hashable, Identifiable {
    public var sha: String
    public var summary: String

    public init(sha: String, summary: String) {
        self.sha = sha
        self.summary = summary
    }

    public var id: String { sha }
}

/// A git commit. Port of `Commit` in `models/commit.ts`.
public struct Commit: Sendable, Equatable, Identifiable {
    public var sha: String
    public var shortSha: String
    public var summary: String
    public var body: String
    public var author: CommitIdentity
    public var committer: CommitIdentity
    public var parentSHAs: [String]
    public var trailers: [Trailer]
    public var tags: [String]

    /// Co-authors parsed from `Co-Authored-By:` trailers (always available;
    /// the original gated this to GitHub repos).
    public var coAuthors: [GitAuthor]
    /// Commit body with `Co-Authored-By:` trailer lines removed.
    public var bodyNoCoAuthors: String
    public var authoredByCommitter: Bool
    public var isMergeCommit: Bool

    public init(
        sha: String,
        shortSha: String,
        summary: String,
        body: String,
        author: CommitIdentity,
        committer: CommitIdentity,
        parentSHAs: [String],
        trailers: [Trailer],
        tags: [String] = []
    ) {
        self.sha = sha
        self.shortSha = shortSha
        self.summary = summary
        self.body = body
        self.author = author
        self.committer = committer
        self.parentSHAs = parentSHAs
        self.trailers = trailers
        self.tags = tags
        self.coAuthors = trailers.filter(\.isCoAuthoredBy).compactMap {
            GitAuthor.parse($0.value)
        }
        var trimmed = body
        for trailer in trailers where trailer.isCoAuthoredBy {
            trimmed = trimmed.replacingOccurrences(
                of: "\(trailer.token): \(trailer.value)", with: "")
        }
        self.bodyNoCoAuthors = trimmed
        self.authoredByCommitter = author.name == committer.name
            && author.email == committer.email
        self.isMergeCommit = parentSHAs.count > 1
    }

    public var id: String { sha }
}
