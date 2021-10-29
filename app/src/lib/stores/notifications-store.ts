import {
  Repository,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { remote } from 'electron'
import { PullRequest, PullRequestRef } from '../../models/pull-request'
import { API, APICheckConclusion, APICheckStatus } from '../api'
import {
  createCombinedCheckFromChecks,
  getLatestCheckRunsByName,
  apiStatusToRefCheck,
  apiCheckRunToRefCheck,
  IRefCheck,
  isSuccess,
} from '../ci-checks/ci-checks'
import { AccountsStore } from './accounts-store'
import { getCommit } from '../git'
import { GitHubRepository } from '../../models/github-repository'
import { PullRequestCoordinator } from './pull-request-coordinator'
import { Commit } from '../../models/commit'

const ChecksFailedPollingInterval = 10 * 60 * 1000 // 10 minutes

function isSuperset<T>(set: ReadonlySet<T>, subset: ReadonlySet<T>): boolean {
  for (const elem of subset) {
    if (!set.has(elem)) {
      return false
    }
  }
  return true
}

type OnChecksFailedCallback = (
  repository: RepositoryWithGitHubRepository,
  pullRequest: PullRequest,
  commitMessage: string,
  commitSha: string,
  checkRuns: ReadonlyArray<IRefCheck>
) => void

type LastCheckedPullRequestEntry = {
  readonly headSha: string
  readonly checkStatus: APICheckStatus
  readonly checkConclusion: APICheckConclusion | null
  readonly completedCheckSuiteIDs: ReadonlySet<number>
}

type LastCheckedPullRequests = Map<number, LastCheckedPullRequestEntry>

export class NotificationsStore {
  private fakePollingTimeoutId: number | null = null
  private repository: RepositoryWithGitHubRepository | null = null
  private onChecksFailedCallback: OnChecksFailedCallback | null = null
  private accountsStore: AccountsStore
  private pullRequestCoordinator: PullRequestCoordinator
  private lastCheckDate: Date | null = null
  private lastCheckedPullRequests: LastCheckedPullRequests = new Map()
  private cachedCommits: Map<string, Commit> = new Map()
  private skipCommitShas: Set<string> = new Set()

  public constructor(
    accountsStore: AccountsStore,
    pullRequestCoordinator: PullRequestCoordinator
  ) {
    this.accountsStore = accountsStore
    this.pullRequestCoordinator = pullRequestCoordinator
  }

  private unsubscribe() {
    if (this.fakePollingTimeoutId !== null) {
      window.clearTimeout(this.fakePollingTimeoutId)
    }
  }

  private subscribe(repository: RepositoryWithGitHubRepository) {
    this.unsubscribe()

    this.repository = repository

    this.fakePollingTimeoutId = window.setTimeout(async () => {
      if (
        this.repository === null ||
        this.repository.hash !== repository.hash
      ) {
        return
      }

      if (1 !== NaN) {
        const pullRequestRef = new PullRequestRef(
          'Unit-Test---This-is-broken-on-purpose',
          'fabada',
          repository.gitHubRepository
        )
        const baseRef = new PullRequestRef(
          'development',
          'fabada',
          repository.gitHubRepository
        )
        const pullRequest = new PullRequest(
          new Date(),
          'Some random PR',
          13013,
          pullRequestRef,
          baseRef,
          'sergiou87',
          false
        )

        const checks = await this.getChecksForRef(
          this.repository,
          pullRequest.head.ref
        )

        if (checks === null) {
          return
        }

        this.postChecksFailedNotification(
          pullRequest,
          checks.checks,
          checks.sha,
          checks.commitMessage
        )

        return
      }

      const account = await this.getAccountForRepository(
        repository.gitHubRepository
      )
      if (account === null) {
        return
      }
      await this.pullRequestCoordinator.refreshPullRequests(repository, account)

      const pullRequests = await this.pullRequestCoordinator.getAllPullRequests(
        repository
      )
      await this.checkPullRequests(pullRequests)
      this.subscribe(repository)
    }, 1000) //ChecksFailedPollingInterval)
  }

  public async checkPullRequests(pullRequests: ReadonlyArray<PullRequest>) {
    if (
      this.lastCheckDate !== null &&
      new Date().getTime() <=
        this.lastCheckDate.getTime() + ChecksFailedPollingInterval
    ) {
      return
    }

    const repository = this.repository
    if (repository === null) {
      return
    }

    const account = await this.getAccountForRepository(
      repository.gitHubRepository
    )

    if (account === null) {
      return
    }

    const checkedPullRequests: LastCheckedPullRequests = new Map()

    for (const pr of pullRequests) {
      const { pullRequestNumber: prNumber, head } = pr
      const previousCheckedPR = this.lastCheckedPullRequests.get(prNumber)

      if (this.skipCommitShas.has(head.sha)) {
        continue
      }

      const commit =
        this.cachedCommits.get(head.sha) ??
        (await getCommit(repository, head.sha))
      if (commit === null) {
        this.skipCommitShas.add(head.sha)
        continue
      }

      this.cachedCommits.set(head.sha, commit)

      if (!account.emails.map(e => e.email).includes(commit.author.email)) {
        this.skipCommitShas.add(head.sha)
        continue
      }

      const checks = await this.getChecksForRef(repository, pr.head.ref)
      if (checks === null) {
        continue
      }

      function validCheckSuiteId(
        checkSuiteId: number | null
      ): checkSuiteId is number {
        return checkSuiteId !== null
      }

      const checkSuiteIDs: Set<number> = new Set(
        checks.checks.map(c => c.checkSuiteId).filter(validCheckSuiteId)
      )

      const allPRChecksCompleted = checks.checks.every(
        check => check.status === APICheckStatus.Completed
      )

      if (!allPRChecksCompleted) {
        checkedPullRequests.set(prNumber, {
          headSha: head.sha,
          checkStatus: APICheckStatus.InProgress,
          checkConclusion: null,
          completedCheckSuiteIDs: new Set(),
        })
        continue
      }

      // Only process these checks if they're not the same as the last time
      if (
        previousCheckedPR !== undefined &&
        previousCheckedPR.checkStatus === APICheckStatus.Completed &&
        isSuperset(previousCheckedPR.completedCheckSuiteIDs, checkSuiteIDs)
      ) {
        checkedPullRequests.set(prNumber, previousCheckedPR)
        continue
      }

      let prCheckConclusion = APICheckConclusion.Success

      for (const check of checks.checks) {
        if (check.conclusion === null || isSuccess(check)) {
          continue
        }

        // Only post the notification if we were previously tracking the PR
        if (previousCheckedPR !== undefined) {
          this.postChecksFailedNotification(
            pr,
            checks.checks,
            checks.sha,
            checks.commitMessage
          )
        }

        prCheckConclusion = APICheckConclusion.Failure
        break
      }

      checkedPullRequests.set(prNumber, {
        headSha: head.sha,
        checkStatus: APICheckStatus.Completed,
        checkConclusion: prCheckConclusion,
        completedCheckSuiteIDs: checkSuiteIDs,
      })
    }

    this.lastCheckedPullRequests = checkedPullRequests
    this.lastCheckDate = new Date()
  }

  public selectRepository(repository: Repository) {
    this.unsubscribe()

    if (!isRepositoryWithGitHubRepository(repository)) {
      return
    }

    this.subscribe(repository)
  }

  private async getAccountForRepository(repository: GitHubRepository) {
    const { endpoint } = repository

    // TODO: make this in a cleaner way
    const accounts = await this.accountsStore.getAll()
    return accounts.find(a => a.endpoint === endpoint) ?? null
  }

  private async getAPIForRepository(repository: GitHubRepository) {
    const account = await this.getAccountForRepository(repository)

    if (account === null) {
      return null
    }

    return API.fromAccount(account)
  }

  private postChecksFailedNotification(
    pullRequest: PullRequest,
    checks: ReadonlyArray<IRefCheck>,
    sha: string,
    commitMessage: string
  ) {
    if (this.repository === null) {
      return
    }

    const repository = this.repository

    const numberOfFailedChecks = checks.filter(
      check => check.conclusion === APICheckConclusion.Failure
    ).length
    const pluralChecks =
      numberOfFailedChecks === 1 ? 'check was' : 'checks were'

    const NOTIFICATION_TITLE = 'Pull Request checks failed'
    const NOTIFICATION_BODY = `${pullRequest.title} #${
      pullRequest.pullRequestNumber
    } (${sha.slice(
      0,
      9
    )})\n${numberOfFailedChecks} ${pluralChecks} not successful.`
    const notification = new remote.Notification({
      title: NOTIFICATION_TITLE,
      body: NOTIFICATION_BODY,
    })

    notification.on('click', () => {
      this.onChecksFailedCallback?.(
        repository,
        pullRequest,
        commitMessage,
        sha,
        checks
      )
    })

    notification.show()
  }

  private async getChecksForRef(
    repository: RepositoryWithGitHubRepository,
    ref: string
  ) {
    const { gitHubRepository } = repository
    const { owner, name } = gitHubRepository

    const api = await this.getAPIForRepository(gitHubRepository)

    if (api === null) {
      return null
    }

    const [statuses, checkRuns] = await Promise.all([
      api.fetchCombinedRefStatus(owner.login, name, ref),
      api.fetchRefCheckRuns(owner.login, name, ref),
    ])

    const checks = new Array<IRefCheck>()

    if (statuses === null || checkRuns === null) {
      return null
    }

    let commitMessage: string

    // Try to get the commit message first from the repository and, if it's not
    // there, then fall back to the API.
    const commit = await getCommit(repository, statuses.sha)
    if (commit !== null) {
      commitMessage = commit.summary
    } else {
      const apiCommit = await api.fetchCommit(owner.login, name, statuses.sha)

      if (apiCommit === null) {
        return null
      }

      commitMessage = apiCommit.commit.message
    }

    if (statuses !== null) {
      checks.push(...statuses.statuses.map(apiStatusToRefCheck))
    }

    if (checkRuns !== null) {
      const latestCheckRunsByName = getLatestCheckRunsByName(
        checkRuns.check_runs
      )
      checks.push(...latestCheckRunsByName.map(apiCheckRunToRefCheck))
    }

    const check = createCombinedCheckFromChecks(checks)

    if (check === null || check.checks.length === 0) {
      return null
    }

    return {
      checks: check.checks,
      commitMessage,
      sha: statuses.sha,
    }
  }

  public onChecksFailedNotification(callback: OnChecksFailedCallback) {
    this.onChecksFailedCallback = callback
  }
}
