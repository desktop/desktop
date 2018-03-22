import { spawn } from './spawn'

export async function getLogLines(
  previousVersion: string
): Promise<ReadonlyArray<string>> {
  const log = await spawn('git', [
    'log',
    `...${previousVersion}`,
    '--merges',
    '--grep="Merge pull request"',
    '--format=format:%s',
    '-z',
    '--',
  ])

  const entries = log.split('\0')

  // this ensures empty entries are ignored - git log might just
  // return a `\0` to indicate that there are no new merged PRs
  return entries.filter(e => e.trim().length > 0)
}
