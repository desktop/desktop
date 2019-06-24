import { Repository, nameOf } from '../../models/repository'

function onCompleted(startTime: number, messagePrefix: string): () => void {
  return () => {
    const rawTime = performance.now() - startTime
    const timeInSeconds = (rawTime / 1000).toFixed(3)
    const message = `[Timing] ${messagePrefix} took ${timeInSeconds}s`
    log.info(message)
  }
}

/**
 * Obtain a timer to measure a unit of work being performed on behalf of the
 * user.
 *
 * The caller will signal completion by invoking the `done` callback which
 * will compute the time taken and emit a helpful message into the logs.
 *
 * This will help users provide feedback about workflows that are noticeably
 * slow for them, and allow engineers to correlate which Git operations might
 * also be involved in this.
 *
 * **Only use this to measure actions performed by the user, as we want to avoid
 * adding noise to the log output by adding unimportant timing information.**
 *
 */
export function startTimer(action: string, repository: Repository) {
  const startTime = performance && performance.now ? performance.now() : null

  if (startTime === null) {
    log.warn(
      `[Timing] invoked but performance.now not found - are you using this outside the renderer?`
    )
    return {
      done: () => {},
    }
  }

  const messagePrefix = `Action '${action}' for '${nameOf(repository)}'`

  return {
    done: onCompleted(startTime, messagePrefix),
  }
}
