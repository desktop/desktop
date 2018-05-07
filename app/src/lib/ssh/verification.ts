import { exec } from 'child_process'
import { getSSHEnvironment } from './ssh-environment'

type HostVerificationError = {
  host: string
  fingerprint: string
  rawOutput: string
}

export async function executeSSHTest(sshUrl: string): Promise<string> {
  const command = 'ssh'
  const env = await getSSHEnvironment(command)
  return new Promise<string>((resolve, reject) => {
    exec(
      `${command} -Tv  -o 'StrictHostKeyChecking=yes' ${sshUrl}`,
      { timeout: 15000, env },
      (error, stdout, stderr) => {
        if (error != null) {
          // TODO: poke at these details, pass them through?
          log.warn(`[executeSSHTest] - an error occurred when invoking ssh`)
        }

        resolve(stderr)
      }
    )
  })
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

export function isPermissionError(stderr: string): boolean {
  const permissionDeniedRe = /.*: Permission denied \(publickey\)\./
  return permissionDeniedRe.test(stderr)
}
