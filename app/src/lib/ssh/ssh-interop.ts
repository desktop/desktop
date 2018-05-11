import { spawn, SpawnOptions } from 'child_process'
import { getSSHEnvironment } from './ssh-environment'

const processExists = require('process-exists')

type ProcessOutput = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

function spawnAndComplete(
  command: string,
  args: string[],
  options?: SpawnOptions
): Promise<ProcessOutput> {
  return new Promise<ProcessOutput>((resolve, reject) => {
    const cp = spawn(command, args, options)
    let totalStdoutLength = 0
    const stdoutChunks = new Array<Buffer>()
    cp.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
      totalStdoutLength += chunk.length
    })

    let totalStderrLength = 0
    const stderrChunks = new Array<Buffer>()
    cp.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
      totalStderrLength += chunk.length
    })

    cp.on('error', err => {
      // for unhandled errors raised by the process, let's surface this in the
      // promise and make the caller handle it
      reject(err)
    })

    cp.on('close', (exitCode, signal) => {
      const stdout = Buffer.concat(stdoutChunks, totalStdoutLength).toString()
      const stderr = Buffer.concat(stderrChunks, totalStderrLength).toString()

      resolve({
        exitCode,
        stdout,
        stderr,
      })
    })
  })
}

export async function isSSHAgentRunning(): Promise<boolean> {
  const running: boolean = await processExists(
    __WIN32__ ? 'ssh-agent.exe' : 'ssh-agent'
  )
  return running
}

export async function listIdentities(): Promise<ProcessOutput> {
  return spawnAndComplete('ssh-add', ['-L'])
}

export function listEnvironmentVariables(): string {
  return `SSH_AUTH_SOCK=${process.env.SSH_AUTH_SOCK}
SSH_AGENT_PID=${process.env.SSH_AGENT_PID}`
}

export async function testSSHConnection(
  sshUrl: string
): Promise<ProcessOutput> {
  const command = 'ssh'
  const env = await getSSHEnvironment(command)
  return spawnAndComplete(
    command,
    ['-Tv', '-o', `StrictHostKeyChecking=yes`, sshUrl],
    { env }
  )
}
