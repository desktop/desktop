import Foundation

// MARK: - RepoListGrouping
// Pure grouping/filter for the repository list (Docs/04-shell-toolbar.md §3).
// Port of `group-repositories.ts` minus the deleted dotcom/enterprise owner
// groups (scope): only `Recent` (≤3, most-recent-first) and `Other` remain.

public struct RepoListSection: Sendable, Equatable {
    public var title: String
    public var repositories: [Repository]

    public init(title: String, repositories: [Repository]) {
        self.title = title
        self.repositories = repositories
    }
}

/// Group repositories into Recent/Other and apply a case-insensitive
/// name/alias/path filter. Recent honors `recentIDs` order.
public func groupRepositoriesForList(
    repositories: [Repository],
    recentIDs: [Int],
    filter: String
) -> [RepoListSection] {
    let needle = filter.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let filtered: [Repository]
    if needle.isEmpty {
        filtered = repositories
    } else {
        filtered = repositories.filter { repo in
            repo.name.lowercased().contains(needle)
                || (repo.alias?.lowercased().contains(needle) == true)
                || repo.path.lowercased().contains(needle)
        }
    }
    let byID = Dictionary(uniqueKeysWithValues: filtered.map { ($0.id, $0) })
    var recent: [Repository] = []
    for id in recentIDs {
        if let repo = byID[id] { recent.append(repo) }
    }
    let recentSet = Set(recentIDs)
    let other = filtered
        .filter { !recentSet.contains($0.id) }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    var sections: [RepoListSection] = []
    if !recent.isEmpty {
        sections.append(RepoListSection(title: "Recent", repositories: recent))
    }
    if !other.isEmpty {
        sections.append(RepoListSection(title: "Other", repositories: other))
    }
    return sections
}

/// Tooltip text for a repo row: name (+alias), path, ahead/behind.
public func repositoryRowTooltip(
    repository: Repository,
    aheadBehind: AheadBehind?,
    changedFilesCount: Int
) -> String {
    var lines: [String] = []
    if let alias = repository.alias, !alias.isEmpty {
        lines.append("\(repository.name) (\(alias))")
    } else {
        lines.append(repository.name)
    }
    lines.append(repository.path)
    if let aheadBehind, aheadBehind.ahead > 0 || aheadBehind.behind > 0 {
        var sync: [String] = []
        if aheadBehind.ahead > 0 { sync.append("\(aheadBehind.ahead) ahead") }
        if aheadBehind.behind > 0 { sync.append("\(aheadBehind.behind) behind") }
        lines.append("The current branch is \(sync.joined(separator: " and ")) its tracked branch.")
    }
    if changedFilesCount > 0 {
        lines.append("There are uncommitted changes in this repository.")
    }
    return lines.joined(separator: "\n")
}
