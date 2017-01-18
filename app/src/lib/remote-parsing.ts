interface IGitRemoteURL {
  /** The hostname of the remote. */
  readonly hostname: string

  /**
   * The owner of the GitHub repository. This will be null if the URL doesn't
   * take the form of a GitHub repository URL (e.g., owner/name).
   */
  readonly owner: string | null

  /**
   * The name of the GitHub repository. This will be null if the URL doesn't
   * take the form of a GitHub repository URL (e.g., owner/name).
   */
  readonly name: string | null
}

/** Parse the remote information from URL. */
export function parseRemote(url: string): IGitRemoteURL | null {
  // Examples:
  // https://github.com/octocat/Hello-World.git
  // git@github.com:octocat/Hello-World.git
  // git:github.com/octocat/Hello-World.git
  const regexes = [
    new RegExp('https://(.+)/(.+)/(.+)(?:.git)'),
    new RegExp('https://(.+)/(.+)/(.+)(?:.git)?'),
    new RegExp('git@(.+):(.+)/(.+)(?:.git)'),
    new RegExp('git:(.+)/(.+)/(.+)(?:.git)'),
  ]

  for (const regex of regexes) {
    const result = url.match(regex)
    if (!result) { continue }

    const hostname = result[1]
    const owner = result[2]
    const name = result[3]
    if (hostname) {
      return { hostname, owner, name }
    }
  }

  return null
}
