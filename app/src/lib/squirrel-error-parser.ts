// an error that Electron raises when it can't find the installation for the running app
const squirrelMissingError = /^Can not find Squirrel$/

// an error that occurs when Squirrel isn't able to reach the update server
const squirrelNetworkError = /System\.Net\.WebException: The remote name could not be resolved: 'central\.github\.com'/

export function parseError(error: Error): Error | null {
  if (squirrelMissingError.test(error.message)) {
    return new Error(
      'The application is missing a dependency it needs to check and install updates. This is very, very bad.'
    )
  }
  if (squirrelNetworkError.test(error.message)) {
    return new Error(
      'The application was not able to reach the update server. Ensure you have internet connectivity and try again.'
    )
  }

  return null
}
