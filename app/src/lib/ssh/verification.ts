type HostVerificationError = {
  host: string
  fingerprint: string
  rawOutput: string
}

export function isHostVerificationError(
  stderr: string
): HostVerificationError | null {
  const noValidHostKeyFoundRe = /No RSA host key is known for (.*) and you have requested strict checking/
  const hostMatch = noValidHostKeyFoundRe.exec(stderr)

  if (hostMatch == null) {
    return null
  }

  const host = hostMatch[1]

  const fingerprintRe = /Server host key: (.*) (.*)/
  const match = fingerprintRe.exec(stderr)

  if (match == null) {
    log.debug(`Server host key entry was not found in output from ssh process`)
    return null
  }

  const fingerprint = match[2]
  const rawOutput = `The authenticity of host '${host}' can't be established.\nRSA key fingerprint is ${fingerprint}.`

  return { host, fingerprint, rawOutput }
}
