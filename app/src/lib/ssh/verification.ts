import { exec, spawn } from 'child_process'
import { getSSHEnvironment } from './ssh-environment'
import * as fs from 'fs'
import * as os from 'os'
import * as Path from 'path'

import { mkdirIfNeeded } from '../file-system'

const processExists = require('process-exists')

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

export async function scanAndWriteToKnownHostsFile(
  host: string
): Promise<void> {
  const sshDir = Path.join(os.homedir(), '.ssh')
  await mkdirIfNeeded(sshDir)

  const command = 'ssh-keyscan'
  const env = await getSSHEnvironment(command)

  return new Promise<void>((resolve, reject) => {
    const keyscan = spawn(command, [host], { shell: true, env })
    const homeDir = os.homedir()
    const knownHostsPath = Path.join(homeDir, '.ssh', 'known_hosts')

    keyscan.stdout.pipe(fs.createWriteStream(knownHostsPath))

    keyscan.on('error', err => {
      log.warn(
        'Unable to execute ssh-keyscan and append to known_hosts file',
        err
      )
    })

    keyscan.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(
            `ssh-keyscan exited with code '${code}' while adding '${host}' which was not expected`
          )
        )
        return
      }
      resolve()
    })
  })
}

export async function findSSHAgentProcess(): Promise<boolean> {
  const found: boolean = await processExists('ssh-agent')
  return found
}
