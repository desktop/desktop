export function getSha() {
  const gitHubSha = process.env.GITHUB_SHA
  if (isGitHubActions() && gitHubSha !== undefined && gitHubSha.length > 0) {
    return gitHubSha
  }

  throw new Error(
    `Unable to get the SHA for the current platform. Check the documentation for the expected environment variables.`
  )
}

export function isGitHubActions() {
  return process.env.GITHUB_ACTIONS === 'true'
}
