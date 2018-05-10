import { exec, spawn } from 'child_process'
import { getSSHEnvironment } from './ssh-environment'

import { createWriteStream } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

import { ensureDir } from 'fs-extra'
import { findExecutableOnPath } from '../find-executable'

const processExists = require('process-exists')

type SSHAgentProcess = {
  readonly pid: number
  readonly env: object
}

export async function scanAndWriteToKnownHostsFile(
  host: string
): Promise<void> {
  const sshDir = join(homedir(), '.ssh')
  await ensureDir(sshDir)

  const command = 'ssh-keyscan'
  const env = await getSSHEnvironment(command)

  return new Promise<void>((resolve, reject) => {
    const keyscan = spawn(command, [host], { shell: true, env })
    const knownHostsPath = join(homedir(), '.ssh', 'known_hosts')

    keyscan.stdout.pipe(createWriteStream(knownHostsPath))

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

export async function findSSHAgentPath(): Promise<string | null> {
  const executable = await findExecutableOnPath('ssh-agent')

  if (executable != null) {
    return executable
  }

  // TODO: what fallback tricks can we do here?
  debugger

  return null
}

export async function findSSHAgentProcess(): Promise<boolean> {
  const found: boolean = await processExists(
    __WIN32__ ? 'ssh-agent.exe' : 'ssh-agent'
  )
  return found
}

export function launchSSHAgent(
  sshAgentLocation: string
): Promise<SSHAgentProcess> {
  return new Promise<SSHAgentProcess>((resolve, reject) => {
    let pid = 0
    const command = `"${sshAgentLocation}"`
    const sshAgent = exec(command, (error, stdout, stderr) => {
      if (error != null) {
        reject(error)
        return
      }

      const sshAuthSocketRe = /SSH_AUTH_SOCK=(.*)\; export SSH_AUTH_SOCK;/
      const sshAgentPidRe = /SSH_AGENT_PID=(.*)\; export SSH_AGENT_PID;/

      const sshAuthSockMatch = sshAuthSocketRe.exec(stdout)
      const sshAgentPidMatch = sshAgentPidRe.exec(stdout)

      if (sshAuthSockMatch != null && sshAgentPidMatch != null) {
        const env = {
          SSH_AUTH_SOCK: sshAuthSockMatch[1],
          SSH_AGENT_PID: sshAgentPidMatch[1],
        }
        resolve({ pid, env })
      } else {
        reject('Unable to retrieve environment variables from ssh-agent')
      }
    })
    pid = sshAgent.pid

    // TODO: do we need to do this?
    sshAgent.unref()
  })
}

type KeyGenResult = {
  readonly publicKeyFile: string
  readonly privateKeyFile: string
}

export async function createSSHKey(
  emailAddress: string,
  passphrase: string,
  outputFile: string
): Promise<KeyGenResult> {
  // TODO: ssh-keygen will block if the file exists - need to handle the situation here
  const command = 'ssh-keygen'
  const args = `${command} -b 4096 -t rsa -C '${emailAddress}' -N '${passphrase}' -f ${outputFile}`
  const env = await getSSHEnvironment(command)
  return new Promise<KeyGenResult>((resolve, reject) => {
    exec(args, { timeout: 15000, env }, (error, stdout, stderr) => {
      if (error != null) {
        reject(error)
        return
      }

      const privateKeyFileRe = /Your identification has been saved in (.*)\./
      const publicKeyFileRe = /Your public key has been saved in (.*)\./

      const privateKeyMatch = privateKeyFileRe.exec(stdout)
      const publicKeyMatch = publicKeyFileRe.exec(stdout)

      if (privateKeyMatch && publicKeyMatch) {
        resolve({
          publicKeyFile: publicKeyMatch[1],
          privateKeyFile: privateKeyMatch[1],
        })
      } else {
        resolve({ publicKeyFile: '', privateKeyFile: '' })
      }
    })
  })
}

export async function addToSSHAgent(
  privateKeyFile: string,
  passphrase: string,
  sshEnvironment: object
): Promise<void> {
  const command = 'ssh-add'
  const env = await getSSHEnvironment(command, sshEnvironment)

  return new Promise<void>((resolve, reject) => {
    const sshAdd = spawn(command, [privateKeyFile], { shell: true, env })

    const stdoutBuffers = new Array<Buffer>()
    let stdoutLength = 0

    sshAdd.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffers.push(chunk)
      stdoutLength += chunk.length
    })

    const stderrBuffers = new Array<Buffer>()
    let stderrLength = 0
    sshAdd.stderr.on('data', (chunk: Buffer) => {
      stderrBuffers.push(chunk)
      stderrLength += chunk.length
    })

    if (passphrase.length > 0) {
      sshAdd.stdin.end(passphrase)
    }

    sshAdd.on('close', code => {
      const stdout = Buffer.concat(stdoutBuffers, stdoutLength)
      const stderr = Buffer.concat(stderrBuffers, stderrLength)

      log.debug(`[addToSSHAgent] got stdout: '${stdout}'`)
      log.debug(`[addToSSHAgent] got stderr: '${stderr}'`)

      debugger

      if (code !== 0) {
        reject('Probably unable to pass in a passphrase with this coding trick')
      }
      resolve()
    })
  })
}

export async function executeSSHTest(
  sshUrl: string,
  environmentVariables: object
): Promise<string> {
  const command = 'ssh'
  const env = await getSSHEnvironment(command, environmentVariables)
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
