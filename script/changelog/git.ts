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

  return log.split('\0')
}
