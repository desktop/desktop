import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileP = promisify(execFile)

/**
 * Helper method for running a shell command and capturing its stdout
 *
 * Do not pass unsanitized user input to this function! Any input containing
 * shell metacharacters may be used to trigger arbitrary command execution.
 */
export const sh = (cmd: string, ...args: string[]) =>
  execFileP(cmd, args, { maxBuffer: Infinity, shell: true }).then(
    ({ stdout }) => stdout
  )
