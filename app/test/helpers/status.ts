import { getStatus } from '../../src/lib/git'
import { Repository } from '../../src/models/repository'

/**
 * git status may return null in some edge cases but for the most
 * part we know we'll get a valid input so let's fail the test
 * if we get null, rather than need to handle it everywhere
 */
export const getStatusOrThrow = async (repository: Repository) => {
  const inner = await getStatus(repository)
  if (inner == null) {
    throw new Error('git status returned null which was not expected')
  }

  return inner
}
