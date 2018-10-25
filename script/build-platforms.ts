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

  if (process.env.NODE_ENV === 'development') {
    return 'development'
  }

  throw new Error(
    `Unable to get the SHA for the current platform. Check the documentation for the expected environment variables.`
  )
}

export function isRunningOnFork() {
  if (isCircleCI() && process.env.CIRCLE_PR_USERNAME != null) {
    return true
  }

  if (
    isAppveyor() &&
    process.env.APPVEYOR_PULL_REQUEST_NUMBER != null &&
    process.env.APPVEYOR_PULL_REQUEST_HEAD_REPO_NAME !== 'desktop/desktop'
  ) {
    return true
  }

  if (
    isTravis() &&
    process.env.TRAVIS_PULL_REQUEST_SLUG != null &&
    // empty string denotes a `push` build
    process.env.TRAVIS_PULL_REQUEST_SLUG !== '' &&
    process.env.TRAVIS_PULL_REQUEST_SLUG !== 'desktop/desktop'
  ) {
    return true
  }

  if (
    isAzurePipelines() &&
    process.env.SYSTEM_PULLREQUEST_ISFORK != null &&
    process.env.SYSTEM_PULLREQUEST_ISFORK === 'True'
  ) {
    return true
  }

  return false
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

export function getReleaseBranchName(): string {
  return (
    process.env.CIRCLE_BRANCH || // macOS
    process.env.APPVEYOR_REPO_BRANCH || // Windows
    process.env.TRAVIS_BRANCH || // Travis CI
    process.env.BUILD_SOURCEBRANCHNAME || // Azure Pipelines
    ''
  )
}
