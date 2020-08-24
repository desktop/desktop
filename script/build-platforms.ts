export function getSha() {
  if (isCircleCI() && process.env.CIRCLE_SHA1 != null) {
    return process.env.CIRCLE_SHA1
  }

  if (isAppveyor() && process.env.APPVEYOR_REPO_COMMIT != null) {
    return process.env.APPVEYOR_REPO_COMMIT
  }

  if (isTravis() && process.env.TRAVIS_COMMIT != null) {
    return process.env.TRAVIS_COMMIT
  }

  const branchCommitId = process.env.BUILD_SOURCEVERSION
  // this check is for a CI build from a local branch
  if (isAzurePipelines() && branchCommitId != null) {
    return branchCommitId
  }

  const pullRequestCommitId = process.env.SYSTEM_PULLREQUEST_SOURCECOMMITID
  if (isAzurePipelines() && pullRequestCommitId != null) {
    return pullRequestCommitId
  }

  const gitHubSha = process.env.GITHUB_SHA
  if (isGitHubActions() && gitHubSha !== undefined && gitHubSha.length > 0) {
    return gitHubSha
  }

  throw new Error(
    `Unable to get the SHA for the current platform. Check the documentation for the expected environment variables.`
  )
}

export function isTravis() {
  return process.platform === 'linux' && process.env.TRAVIS === 'true'
}

export function isCircleCI() {
  return process.platform === 'darwin' && process.env.CIRCLECI === 'true'
}

export function isAppveyor() {
  return process.platform === 'win32' && process.env.APPVEYOR === 'True'
}

export function isAzurePipelines() {
  return (
    process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI ===
    'https://github.visualstudio.com/'
  )
}

export function isGitHubActions() {
  return process.env.GITHUB_ACTIONS === 'true'
}

export function getReleaseBranchName(): string {
  // GitHub Actions
  if (process.env.GITHUB_REF !== undefined) {
    return process.env.GITHUB_REF.replace(/^refs\/heads\//, '')
  }

  return (
    process.env.CIRCLE_BRANCH || // macOS
    process.env.APPVEYOR_REPO_BRANCH || // Windows
    process.env.TRAVIS_BRANCH || // Travis CI
    process.env.BUILD_SOURCEBRANCHNAME || // Azure Pipelines
    ''
  )
}
