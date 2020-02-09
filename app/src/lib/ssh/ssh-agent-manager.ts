import { exec } from 'child_process'

import { findExecutableOnPath } from '../find-executable'

const processExists = require('process-exists')

export enum AgentStateKind {
  NotFound = 'NotFound',
  NotStarted = 'NotStarted',
  Running = 'Running',
}

type AgentNotFoundState = {
  readonly kind: AgentStateKind.NotFound
}

type AgentNotStartedState = {
  readonly kind: AgentStateKind.NotStarted
  readonly executablePath: string
}

type AgentRunningState = {
  readonly kind: AgentStateKind.Running
  readonly executablePath: string
  readonly env: object
}

export type AgentState =
  | AgentNotFoundState
  | AgentNotStartedState
  | AgentRunningState

type SSHAgentProcess = {
  readonly pid: number
  readonly env: object
}

export class SSHAgentManager {
  private env: object = {}
  private executablePath: string | null = null

  public async reset(): Promise<void> {
    this.executablePath = await findExecutableOnPath('ssh-agent')
  }

  public async getState(): Promise<AgentState> {
    if (this.executablePath == null) {
      return { kind: AgentStateKind.NotFound }
    }

    const running: boolean = await processExists(
      __WIN32__ ? 'ssh-agent.exe' : 'ssh-agent'
    )

    if (!running) {
      return {
        kind: AgentStateKind.NotStarted,
        executablePath: this.executablePath,
      }
    }

    const existingEnv = process.env
    if (
      existingEnv.SSH_AUTH_SOCK != null &&
      existingEnv.SSH_AGENT_PID != null
    ) {
      log.debug(
        '[SSHAgentManager] found existing environment variables for SSH agent, using that...'
      )
      this.env = {
        SSH_AUTH_SOCK: existingEnv.SSH_AUTH_SOCK,
        SSH_AGENT_PID: existingEnv.SSH_AGENT_PID,
      }
    }

    // TODO: get environment variable from shell without needing to poke at this?
    // This looks interesting:
    // https://github.com/wwalker/ssh-find-agent/blob/master/ssh-find-agent.sh
    return {
      kind: AgentStateKind.Running,
      executablePath: this.executablePath,
      env: this.env,
    }
  }

  public async launch(): Promise<SSHAgentProcess> {
    if (this.executablePath == null) {
      throw new Error(
        `Unable to launch when the executable isn't found on the machine`
      )
    }

    return new Promise<SSHAgentProcess>((resolve, reject) => {
      let pid = 0
      const command = `"${this.executablePath}"`
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
          this.env = {
            SSH_AUTH_SOCK: sshAuthSockMatch[1],
            SSH_AGENT_PID: sshAgentPidMatch[1],
          }
          resolve({ pid, env: this.env })
        } else {
          reject('Unable to retrieve environment variables from ssh-agent')
        }
      })
      pid = sshAgent.pid

      // TODO: do we need to do this?
      sshAgent.unref()
    })
  }
}
