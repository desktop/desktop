// an error that Electron raises when it can't find the installation for the running app
const squirrelMissingRegex = /^Can not find Squirrel$/

// an error that occurs when Squirrel isn't able to reach the update server
const squirrelDNSRegex =
  /System\.Net\.WebException: The remote name could not be resolved: 'central\.github\.com'/

// an error that occurs when the connection times out during updating
const squirrelTimeoutRegex =
  /A connection attempt failed because the connected party did not properly respond after a period of time, or established connection failed because connected host has failed to respond/

/**
 * This method parses known error messages from Squirrel.Windows and returns a
 * friendlier message to the user.
 *
 * @param error The underlying error from Squirrel.
 */
export function parseError(error: Error): Error | null {
  if (squirrelMissingRegex.test(error.message)) {
    return new Error(
      'The application is missing a dependency it needs to check and install updates. This is very, very bad.'
    )
  }
  if (squirrelDNSRegex.test(error.message)) {
    return new Error(
      'GitHub Desktop was not able to contact the update server. Ensure you have internet connectivity and try again.'
    )
  }
  if (squirrelTimeoutRegex.test(error.message)) {
    return new Error(
      'GitHub Desktop was not able to check for updates due to a timeout. Ensure you have internet connectivity and try again.'
    )
  }

  return null
}
