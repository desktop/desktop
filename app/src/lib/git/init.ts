import { git } from './core'

/** Init a new git repository in the given path. */
export async function initGitRepository(path: string): Promise<void> {
  await git(['init'], path, 'initGitRepository')
}
