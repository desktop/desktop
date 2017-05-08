import * as OS from 'os'
import { UAParser } from 'ua-parser-js'
import { StatsDatabase, ILaunchStats, IDailyMeasures } from './stats-database'
import { getDotComAPIEndpoint } from '../api'
import { getVersion } from '../../ui/lib/app-proxy'
import { hasShownWelcomeFlow } from '../welcome'
import { Account } from '../../models/account'
import { uuid } from '../uuid'

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

const LastDailyStatsReportKey = 'last-daily-stats-report'

/** The localStorage key for the stats GUID. */
const StatsGUIDKey = 'stats-guid'

/** How often daily stats should be submitted (i.e., 24 hours). */
const DailyStatsReportInterval = 1000 * 60 * 60 * 24

type DailyStats = { version: string } & ILaunchStats & IDailyMeasures

/** The store for the app's stats. */
export class StatsStore {
  private readonly db: StatsDatabase

  /** Has the user opted out of stats reporting? */
  private optOut: boolean

  /** The GUID for uniquely identifying installations. */
  private readonly guid: string

  public constructor(db: StatsDatabase) {
    this.db = db

    const optOutValue = localStorage.getItem('stats-opt-out')
    if (optOutValue) {
      this.optOut = !!parseInt(optOutValue, 10)
    } else {
      this.optOut = false
    }

    let guid = localStorage.getItem(StatsGUIDKey)
    if (!guid) {
      guid = uuid()
      localStorage.setItem(StatsGUIDKey, guid)
    }

    this.guid = guid
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
  public async reportStats(accounts: ReadonlyArray<Account>) {
    if (this.optOut) { return }

    // Never report stats while in dev or test. They could be pretty crazy.
    if (__DEV__ || process.env.TEST_ENV) {
      return
    }

    // don't report until the user has had a chance to view and opt-in for
    // sharing their stats with us
    if (!hasShownWelcomeFlow()) {
      return
    }

    if (!this.shouldReportDailyStats()) {
      return
    }

    const now = Date.now()
    const stats = await this.getDailyStats(accounts)
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stats),
    }

    try {
      const response = await fetch(StatsEndpoint, options)
      if (!response.ok) {
        throw new Error(`Unexpected status: ${response.statusText} (${response.status})`)
      }

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
  private async getDailyStats(accounts: ReadonlyArray<Account>): Promise<DailyStats> {
    const launchStats = await this.getAverageLaunchStats()
    const dailyMeasures = await this.getDailyMeasures()
    const userType = this.determineUserType(accounts)

    return {
      version: getVersion(),
      osVersion: this.getOS(),
      platform: process.platform,
      ...launchStats,
      ...dailyMeasures,
      ...userType,
      guid: this.guid,
    }
  }

  private getOS() {
    if (__DARWIN__) {
      // On macOS, OS.release() gives us the kernel version which isn't terribly
      // meaningful to any human being, so we'll parse the User Agent instead.
      // See https://github.com/desktop/desktop/issues/1130.
      const parser = new UAParser()
      const os = parser.getOS()
      return `${os.name} ${os.version}`
    } else if (__WIN32__) {
      return `Windows ${OS.release()}`
    } else {
      return `${OS.type()} ${OS.release()}`
    }
  }

  /** Determines if an account is a dotCom and/or enterprise user */
  private determineUserType(accounts: ReadonlyArray<Account>) {
    const dotComAccount = accounts.find(a => a.endpoint === getDotComAPIEndpoint()) !== undefined
    const enterpriseAccount = accounts.find(a => a.endpoint !== getDotComAPIEndpoint()) !== undefined

    return {
      dotComAccount,
      enterpriseAccount,
    }
  }

  /** Calculate the average launch stats. */
  private async getAverageLaunchStats(): Promise<ILaunchStats> {
    const launches: ReadonlyArray<ILaunchStats> | undefined = await this.db.launches.toArray()
    if (!launches || !launches.length) {
      return {
        mainReadyTime: -1,
        loadTime: -1,
        rendererReadyTime: -1,
      }
    }

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
    let measures: IDailyMeasures | undefined = await this.db.dailyMeasures.limit(1).first()
    if (!measures) {
      measures = this.getDefaultDailyMeasures()
    }

    return measures
  }

  private getDefaultDailyMeasures(): IDailyMeasures {
    return {
      commits: 0,
    }
  }

  /** Record that a commit was accomplished. */
  public async recordCommit() {
    const db = this.db
    const defaultMeasures = this.getDefaultDailyMeasures()
    await this.db.transaction('rw', this.db.dailyMeasures, function*() {
      let measures: IDailyMeasures | null = yield db.dailyMeasures.limit(1).first()
      if (!measures) {
        measures = defaultMeasures
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
