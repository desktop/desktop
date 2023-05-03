import { findOnPath } from '../../lib/is-git-on-path'

/**
 * Returns boolean indicating whether or not executable exists on path
 */
export const executableExists = async (execName: string): Promise<Boolean> => {
  try {
    await findOnPath(execName)
    return true
  } catch (error) {
    return false
  }
}
