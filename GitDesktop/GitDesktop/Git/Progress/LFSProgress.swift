import Foundation

// MARK: - LFSProgress
// Port of `electron/app/src/lib/progress/lfs.ts` (`GitLFSProgressParser` +
// `createLFSProgressFile` semantics + `formatBytes` from `ui/lib/bytes.ts`).
//
// Git LFS reports per-file transfer lines of the form:
//   `<direction> <current>/<total files> <downloaded>/<total> <name>`
// (see `git-lfs-config(5)` `lfs.progress`). The reference tails these from a
// `GIT_LFS_PROGRESS` temp file while git runs; the parser itself is a pure
// value type here so scripted lines can drive it in tests. Live tailing is
// future work alongside incremental stderr streaming (see `Sync.swift`).

/// One LFS file's last-seen transfer state.
public struct LFSFileProgress: Sendable, Equatable {
    /// Bytes transferred for this file.
    public var transferred: Int
    /// Total file size in bytes.
    public var size: Int
    public var done: Bool

    public init(transferred: Int, size: Int, done: Bool) {
        self.transferred = transferred
        self.size = size
        self.done = done
    }
}

public enum LFSProgressEvent: Sendable, Equatable {
    /// Aggregate transfer estimate. Always indeterminate (`percent == 0`),
    /// mirroring the reference which reports LFS as non-fractional progress
    /// with a human-readable `info.text` summary.
    case progress(percent: Double, info: GitProgressInfo)
    case context(text: String)
}

/// Parser for `GIT_LFS_PROGRESS` lines.
public struct LFSProgressParser: Sendable {
    private static let linePattern: NSRegularExpression? = try? NSRegularExpression(
        pattern: #"^(.+?)\s{1}(\d+)\/(\d+)\s{1}(\d+)\/(\d+)\s{1}(.+)$"#)

    public var files: [String: LFSFileProgress] = [:]

    public init() {}

    public mutating func parse(line: String) -> LFSProgressEvent {
        guard let regex = Self.linePattern,
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              match.numberOfRanges == 7,
              let direction = group(match, 1, in: line),
              let estimatedCount = intGroup(match, 3, in: line),
              let transferred = intGroup(match, 4, in: line),
              let size = intGroup(match, 5, in: line),
              let fileName = group(match, 6, in: line)
        else {
            return .context(text: line)
        }

        files[fileName] = LFSFileProgress(
            transferred: transferred, size: size, done: transferred == size)

        var totalTransferred = 0
        var totalEstimated = 0
        var finishedFiles = 0
        // Download estimates are unreliable; use whichever is bigger of the
        // estimate and the number of files actually seen.
        let fileCount = max(estimatedCount, files.count)
        for file in files.values {
            totalTransferred += file.transferred
            totalEstimated += file.size
            finishedFiles += file.done ? 1 : 0
        }

        let transferProgress =
            "\(formatBytes(Double(totalTransferred), decimals: 1)) / \(formatBytes(Double(totalEstimated), decimals: 1))"
        let verb = Self.humanFacingVerb(direction)
        let text =
            "\(verb) \(fileName) (\(finishedFiles) out of an estimated \(fileCount) completed, \(transferProgress))"
        let info = GitProgressInfo(
            title: "\(verb) \"\(fileName)\"",
            value: Double(totalTransferred),
            total: Double(totalEstimated),
            percent: 0,
            done: false,
            text: text)
        return .progress(percent: 0, info: info)
    }

    private static func humanFacingVerb(_ direction: String) -> String {
        switch direction {
        case "download": return "Downloading"
        case "upload": return "Uploading"
        case "checkout": return "Checking out"
        default: return "Downloading"
        }
    }

    private func group(_ match: NSTextCheckingResult, _ index: Int, in line: String) -> String? {
        let range = match.range(at: index)
        guard range.location != NSNotFound, let swiftRange = Range(range, in: line) else { return nil }
        return String(line[swiftRange])
    }

    private func intGroup(_ match: NSTextCheckingResult, _ index: Int, in line: String) -> Int? {
        guard let text = group(match, index, in: line) else { return nil }
        return Int(text)
    }
}

/// Format a byte count with IEC units (port of `formatBytes`, legacy branch —
/// per scope there are no number-format settings, so the system default path
/// applies; the reference's preference-gated branch is omitted).
public func formatBytes(_ bytes: Double, decimals: Int = 0) -> String {
    let units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
    guard bytes.isFinite, bytes > 0 else {
        return bytes == 0 ? "0 B" : "\(bytes)"
    }
    let index = min(units.count - 1, Int(floor(log(bytes) / log(1024))))
    let value = roundToDecimals(bytes / pow(1024, Double(index)), decimals)
    // Drop the trailing `.0` for whole values with the default 0 decimals,
    // matching the reference's `${round(...)} ${unit}` interpolation.
    if decimals == 0 {
        return "\(Int(value)) \(units[index])"
    }
    return "\(value) \(units[index])"
}

/// Round to N decimals (port of `ui/lib/round.ts`).
public func roundToDecimals(_ value: Double, _ decimals: Int) -> Double {
    guard decimals > 0 else { return value.rounded() }
    let factor = pow(10, Double(decimals))
    return ((value + Double.ulpOfOne) * factor).rounded() / factor
}
