import * as Path from 'path'

import { getGitDir } from '../git'

/**
 * Get the path to the parent of the .git directory or null if the path isn't a
 * valid repository.
 */
export async function validatedRepositoryPath(path: string): Promise<string | null> {
  try {
    const gitDir = await getGitDir(path)
    return gitDir ? Path.dirname(gitDir) : null
  } catch (e) {
    return null
  }
}
