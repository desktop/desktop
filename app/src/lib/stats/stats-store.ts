import { StatsDatabase, ILaunchStats, IDailyMeasures } from './stats-database'
import { getDotComAPIEndpoint } from '../api'
import { getVersion } from '../../ui/lib/app-proxy'
import { hasShownWelcomeFlow } from '../welcome'
import { Account } from '../../models/account'
import { getOS } from '../get-os'
import { getGUID } from './get-guid'
import { Repository } from '../../models/repository'
import { merge } from '../../lib/merge'

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

/** The URL to the stats samples page. */
export const SamplesURL = 'https://desktop.github.com/usage-data/'

const LastDailyStatsReportKey = 'last-daily-stats-report'

/** The localStorage key for whether the user has opted out. */
const StatsOptOutKey = 'stats-opt-out'

/** Have we successfully sent the stats opt-in? */
const HasSentOptInPingKey = 'has-sent-stats-opt-in-ping'

/** How often daily stats should be submitted (i.e., 24 hours). */
const DailyStatsReportInterval = 1000 * 60 * 60 * 24

const DefaultDailyMeasures: IDailyMeasures = {
  commits: 0,
  partialCommits: 0,
  openShellCount: 0,
}

type DailyStats = { version: string } & ILaunchStats & IDailyMeasures

/** The store for the app's stats. */
export class StatsStore {
  private readonly db: StatsDatabase

  /** Has the user opted out of stats reporting? */
  private optOut: boolean

  public constructor(db: StatsDatabase) {
    this.db = db

    const optOutValue = localStorage.getItem(StatsOptOutKey)
    if (optOutValue) {
      this.optOut = !!parseInt(optOutValue, 10)

      // If the user has set an opt out value but we haven't sent the ping yet,
      // give it a shot now.
      if (!localStorage.getItem(HasSentOptInPingKey)) {
        this.sendOptInStatusPing(!this.optOut)
      }
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
  public async reportStats(
    accounts: ReadonlyArray<Account>,
    repositories: ReadonlyArray<Repository>
  ) {
    if (this.optOut) {
      return
    }

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
    const stats = await this.getDailyStats(accounts, repositories)

    try {
      const response = await this.post(stats)
      if (!response.ok) {
        throw new Error(
          `Unexpected status: ${response.statusText} (${response.status})`
        )
      }

      log.info('Stats reported.')

      await this.clearDailyStats()
      localStorage.setItem(LastDailyStatsReportKey, now.toString())
    } catch (e) {
      log.error('Error reporting stats:', e)
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
  private async getDailyStats(
    accounts: ReadonlyArray<Account>,
    repositories: ReadonlyArray<Repository>
  ): Promise<DailyStats> {
    const launchStats = await this.getAverageLaunchStats()
    const dailyMeasures = await this.getDailyMeasures()
    const userType = this.determineUserType(accounts)
    const repositoryCounts = this.categorizedRepositoryCounts(repositories)

    return {
      eventType: 'usage',
      version: getVersion(),
      osVersion: getOS(),
      platform: process.platform,
      ...launchStats,
      ...dailyMeasures,
      ...userType,
      guid: getGUID(),
      ...repositoryCounts,
    }
  }

  private categorizedRepositoryCounts(repositories: ReadonlyArray<Repository>) {
    return {
      repositoryCount: repositories.length,
      gitHubRepositoryCount: repositories.filter(r => r.gitHubRepository)
        .length,
    }
  }

  /** Determines if an account is a dotCom and/or enterprise user */
  private determineUserType(accounts: ReadonlyArray<Account>) {
    const dotComAccount = !!accounts.find(
      a => a.endpoint === getDotComAPIEndpoint()
    )
    const enterpriseAccount = !!accounts.find(
      a => a.endpoint !== getDotComAPIEndpoint()
    )

    return {
      dotComAccount,
      enterpriseAccount,
    }
  }

  /** Calculate the average launch stats. */
  private async getAverageLaunchStats(): Promise<ILaunchStats> {
    const launches:
      | ReadonlyArray<ILaunchStats>
      | undefined = await this.db.launches.toArray()
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
        rendererReadyTime:
          running.rendererReadyTime + current.rendererReadyTime,
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
    const measures:
      | IDailyMeasures
      | undefined = await this.db.dailyMeasures.limit(1).first()
    return {
      ...DefaultDailyMeasures,
      ...measures,
      // We could spread the database ID in, but we really don't want it.
      id: undefined,
    }
  }

  private async updateDailyMeasures<K extends keyof IDailyMeasures>(
    fn: (measures: IDailyMeasures) => Pick<IDailyMeasures, K>
  ): Promise<void> {
    const db = this.db
    const defaultMeasures = DefaultDailyMeasures
    await this.db.transaction('rw', this.db.dailyMeasures, function*() {
      const measures: IDailyMeasures | null = yield db.dailyMeasures
        .limit(1)
        .first()
      const measuresWithDefaults = {
        ...defaultMeasures,
        ...measures,
      }
      const newMeasures = merge(measuresWithDefaults, fn(measuresWithDefaults))

      return db.dailyMeasures.put(newMeasures)
    })
  }

  /** Record that a commit was accomplished. */
  public recordCommit(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      commits: m.commits + 1,
    }))
  }

  /** Record that a partial commit was accomplished. */
  public recordPartialCommit(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      partialCommits: m.partialCommits + 1,
    }))
  }

  /** Record that the user opened a shell. */
  public recordOpenShell(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      openShellCount: m.openShellCount + 1,
    }))
  }

  /** Set whether the user has opted out of stats reporting. */
  public async setOptOut(optOut: boolean): Promise<void> {
    const changed = this.optOut !== optOut

    this.optOut = optOut

    localStorage.setItem(StatsOptOutKey, optOut ? '1' : '0')

    if (changed) {
      await this.sendOptInStatusPing(!optOut)
    }
  }

  /** Has the user opted out of stats reporting? */
  public getOptOut(): boolean {
    return this.optOut
  }

  /** Post some data to our stats endpoint. */
  private post(body: object): Promise<Response> {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }

    return fetch(StatsEndpoint, options)
  }

  private async sendOptInStatusPing(optIn: boolean): Promise<void> {
    const direction = optIn ? 'in' : 'out'
    try {
      const response = await this.post({
        eventType: 'ping',
        optIn,
      })
      if (!response.ok) {
        throw new Error(
          `Unexpected status: ${response.statusText} (${response.status})`
        )
      }

      localStorage.setItem(HasSentOptInPingKey, '1')

      log.info(`Opt ${direction} reported.`)
    } catch (e) {
      log.error(`Error reporting opt ${direction}:`, e)
    }
  }
}
