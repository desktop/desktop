import { execFile as execFileOrig } from 'child_process'
import { promisify } from 'util'

/**
 * A version of execFile which returns a Promise rather than the traditional
 * callback approach of `child_process.execFile`.
 *
 * See `child_process.execFile` for more information
 */
export const execFile = promisify(execFileOrig)
