/** Parse the GIT_ASKPASS prompt and determine the appropriate response. */
export function responseForPrompt(prompt: string): string | null {
  if (prompt.startsWith('Username')) {
    return process.env.DESKTOP_USERNAME
  } else if (prompt.startsWith('Password')) {
    return process.env.DESKTOP_PASSWORD
  }

  return null
}
