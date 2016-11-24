import { StatsDatabase, ILaunchStats } from './stats-database'
import { getVersion } from '../../ui/lib/app-proxy'
import { proxyRequest } from '../../ui/main-process-proxy'

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

const LastDailyStatsReportKey = 'last-daily-stats-report'

/** How often daily stats should be submitted (i.e., 24 hours). */
const DailyStatsReportInterval = 1000 * 60 * 60 * 24

type DailyStats = { version: string } & ILaunchStats

/** The store for the app's stats. */
export class StatsStore {
  private db: StatsDatabase

  public constructor(db: StatsDatabase) {
    this.db = db
  }

  /** Should the app report its daily stats? */
  private shouldReportDailyStats(): boolean {
    const lastDateString = localStorage.getItem(LastDailyStatsReportKey)
    let lastDate = 0
    if (lastDateString && lastDateString.length > 0) {
      lastDate = parseInt(lastDateString, 10)
    }

    if (isNaN(lastDate)) {
      lastDate = 0
    }

    const now = Date.now()
    return now - lastDate > DailyStatsReportInterval
  }

  /** Report any stats which are eligible for reporting. */
  public async reportStats() {
    // Never report stats while in dev or test. They could be pretty crazy.
    if (__DEV__ || process.env.TEST_ENV) {
      return
    }

    if (!this.shouldReportDailyStats()) {
      return
    }

    const now = Date.now()
    const stats = await this.getDailyStats()
    const body = JSON.stringify(stats)
    const options: Electron.RequestOptions = {
      url: StatsEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }

    try {
      await proxyRequest(options, body)
      console.log('Stats reported.')

      await this.clearLaunchStats()
      localStorage.setItem(LastDailyStatsReportKey, now.toString())
    } catch (e) {
      console.error('Error reporting stats:')
      console.error(e)
    }
  }

  /** Record the given launch stats. */
  public async recordLaunchStats(stats: ILaunchStats) {
    await this.db.launches.add(stats)
  }

  /** Clear the stored launch stats. */
  private async clearLaunchStats() {
    await this.db.launches.clear()
  }

  private async getDailyStats(): Promise<DailyStats> {
    const launchStats = await this.getAverageLaunchStats()
    return Object.assign({}, { version: getVersion() }, launchStats)
  }

  /** Calculate the average launch stats. */
  private async getAverageLaunchStats(): Promise<ILaunchStats> {
    const launches = await this.db.launches.toArray()
    const start: ILaunchStats = {
      mainReadyTime: 0,
      loadTime: 0,
      rendererReadyTime: 0,
    }
    const totals = launches.reduce((running, current) => {
      return {
        mainReadyTime: running.mainReadyTime + current.mainReadyTime,
        loadTime: running.loadTime + current.loadTime,
        rendererReadyTime: running.rendererReadyTime + current.rendererReadyTime,
      }
    }, start)

    return {
      mainReadyTime: totals.mainReadyTime / launches.length,
      loadTime: totals.loadTime / launches.length,
      rendererReadyTime: totals.rendererReadyTime / launches.length,
    }
  }
}
