import { uuid } from '../uuid'

const trampolineTokens = new Set<string>()

function requestTrampolineToken() {
  const token = uuid()
  trampolineTokens.add(token)
  return token
}

function revokeTrampolineToken(token: string) {
  trampolineTokens.delete(token)
}

/** Checks if a given trampoline token is valid. */
export function isValidTrampolineToken(token: string) {
  return trampolineTokens.has(token)
}

/**
 * Allows invoking a function with a short-lived trampoline token that will be
 * revoked right after the function finishes.
 *
 * @param fn Function to invoke with the trampoline token.
 */
export async function withTrampolineToken<T>(
  fn: (token: string) => Promise<T>
): Promise<T> {
  const token = requestTrampolineToken()
  let result

  try {
    result = await fn(token)
  } finally {
    revokeTrampolineToken(token)
  }

  return result
}
