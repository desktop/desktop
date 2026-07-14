import { sh } from '../sh'

export const getLogLines = (previousVersion: string) =>
  sh(
    'git',
    'log',
    `...${previousVersion}`,
    '--merges',
    '--grep="Merge pull request"',
    '--format=format:%s',
    '-z',
    '--'
  ).then(x => (x.length === 0 ? [] : x.split('\0')))
