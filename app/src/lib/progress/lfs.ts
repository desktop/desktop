import { mkTempFile } from '../file-system'

export function createProgressFile(): Promise<string> {
  return mkTempFile('GitHubDesktop-lfs-progress')
}

