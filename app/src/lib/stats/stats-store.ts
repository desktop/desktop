import * as OS from 'os'
import { StatsDatabase, ILaunchStats, IDailyMeasures } from './stats-database'
import { getVersion } from '../../ui/lib/app-proxy'
import { proxyRequest } from '../../ui/main-process-proxy'
import { IHTTPRequest } from '../http'

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

const LastDailyStatsReportKey = 'last-daily-stats-report'

/** How often daily stats should be submitted (i.e., 24 hours). */
const DailyStatsReportInterval = 1000 * 60 * 60 * 24

type DailyStats = { version: string } & ILaunchStats & IDailyMeasures

/** The store for the app's stats. */
export class StatsStore {
  private db: StatsDatabase

  /** Has the user opted out of stats reporting? */
  private optOut: boolean

  public constructor(db: StatsDatabase) {
    this.db = db

    const optOutValue = localStorage.getItem('stats-opt-out')
    if (optOutValue) {
      this.optOut = !!parseInt(optOutValue, 10)
    } else {
      this.optOut = false
    }
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
    if (this.optOut) { return }

    // Never report stats while in dev or test. They could be pretty crazy.
    if (__DEV__ || process.env.TEST_ENV) {
      return
    }

    if (!this.shouldReportDailyStats()) {
      return
    }

    const now = Date.now()
    const stats = await this.getDailyStats()
    const options: IHTTPRequest = {
      url: StatsEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: stats,
    }

    try {
      await proxyRequest(options)
      console.log('Stats reported.')

      await this.clearDailyStats()
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

  /** Clear the stored daily stats. */
  private async clearDailyStats() {
    await this.db.launches.clear()
    await this.db.dailyMeasures.clear()
  }

  /** Get the daily stats. */
  private async getDailyStats(): Promise<DailyStats> {
    const launchStats = await this.getAverageLaunchStats()
    const dailyMeasures = await this.getDailyMeasures()
    return {
      version: getVersion(),
      osVersion: OS.release(),
      platform: process.platform,
      ...launchStats,
      ...dailyMeasures,
    }
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

  /** Get the daily measures. */
  private async getDailyMeasures(): Promise<IDailyMeasures> {
    const measures: IDailyMeasures = await this.db.dailyMeasures.limit(1).first()
    return measures
  }

  /** Record that a commit was accomplished. */
  public async recordCommit() {
    const db = this.db
    await this.db.transaction('rw', this.db.dailyMeasures, function*() {
      let measures: IDailyMeasures | null = yield db.dailyMeasures.limit(1).first()
      if (!measures) {
        measures = {
          commits: 0,
        }
      }

      let newMeasures: IDailyMeasures = {
        commits: measures.commits + 1,
      }

      if (measures.id) {
        newMeasures = { ...newMeasures, id: measures.id }
      }

      return db.dailyMeasures.put(newMeasures)
    })
  }

  /** Set whether the user has opted out of stats reporting. */
  public setOptOut(optOut: boolean) {
    this.optOut = optOut

    localStorage.setItem('stats-opt-out', optOut ? '1' : '0')
  }

  /** Has the user opted out of stats reporting? */
  public getOptOut(): boolean {
    return this.optOut
  }
}
