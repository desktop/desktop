import { uuid } from './uuid'

const trampolineTokens = new Set<string>()

export function isValidTrampolineToken(token: string) {
  return trampolineTokens.has(token)
}

function requestTrampolineToken() {
  const token = uuid()
  trampolineTokens.add(token)
  return token
}

function revokeTrampolineToken(token: string) {
  trampolineTokens.delete(token)
}

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
