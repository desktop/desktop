const got = require('got')

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

const LastStatsReportKey = 'last-stats-report'

const StatsReportInterval = 1000 * 60 * 60 * 24

/** The timing stats for app launch. */
export interface ILaunchTimingStats {
  /**
   * The time (in milliseconds) it takes from when our main process code is
   * first loaded until the app `ready` event is emitted.
   */
  readonly mainReadyTime: number

  /**
   * The time (in milliseconds) it takes from when loading begins to loading
   * end.
   */
  readonly loadTime: number

  /**
   * The time (in milliseconds) it takes from when our renderer process code is
   * first loaded until the renderer `ready` event is emitted.
   */
  readonly rendererReadyTime: number
}

export interface IStats {
  readonly launchTimingStats: ILaunchTimingStats
  readonly version: string
}

/** Should the app report its stats? */
export function shouldReportStats(): boolean {
  const lastDateString = localStorage.getItem(LastStatsReportKey)
  let lastDate = 0
  if (lastDateString && lastDateString.length > 0) {
    lastDate = parseInt(lastDateString, 10)
  }

  if (isNaN(lastDate)) {
    lastDate = 0
  }

  const now = Date.now()
  return now - lastDate > StatsReportInterval
}

/** Report the given stats to Central. */
export async function reportStats(stats: IStats) {
  if (__DEV__ || process.env.TEST_ENV) {
    return
  }

  const now = Date.now()
  const flattenedStats = Object.assign({}, stats, stats.launchTimingStats)
  const body = JSON.stringify(flattenedStats)
  const options = {
    body,
    json: true,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  try {
    await got.post(StatsEndpoint, options)
    console.log('Stats reported.')

    localStorage.setItem(LastStatsReportKey, now.toString())
  } catch (e) {
    console.error('Error reporting stats:')
    console.error(e)
  }
}
