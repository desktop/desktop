import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function getLogLines(previousVersion: string) {
  const { stdout } = await execFileAsync(
    'git',
    [
      'log',
      `...${previousVersion}`,
      '--merges',
      '--grep="Merge pull request"',
      '--format=format:%s',
      '-z',
      '--',
    ],
    { shell: true }
  )
  return stdout.length === 0 ? [] : stdout.split('\0')
}
