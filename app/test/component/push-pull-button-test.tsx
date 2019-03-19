import * as React from 'react'
import * as moment from 'moment'

import { render, cleanup } from 'react-testing-library'
import { PushPullButton } from '../../src/ui/toolbar/push-pull-button'
import { InMemoryDispatcher } from '../helpers/in-memory-dispatcher'
import {
  AppStore,
  GitHubUserStore,
  IssuesStore,
  CloningRepositoriesStore,
  SignInStore,
  RepositoriesStore,
  AccountsStore,
  PullRequestStore,
} from '../../src/lib/stores'
import { ApiRepositoriesStore } from '../../src/lib/stores/api-repositories-store'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import {
  TestGitHubUserDatabase,
  TestIssuesDatabase,
  TestStatsDatabase,
  TestRepositoriesDatabase,
  TestPullRequestDatabase,
} from '../helpers/databases'
import { TestActivityMonitor } from '../helpers/test-activity-monitor'
import { StatsStore } from '../../src/lib/stats'
import { AsyncInMemoryStore, InMemoryStore } from '../helpers/stores'
import { TipState } from '../../src/models/tip'
import { setupEmptyRepository } from '../helpers/repositories'
import { IFetchProgress } from '../../src/models/progress'
import { Repository } from '../../src/models/repository'
import { PropsType } from '../../src/ui/lib/props-type'

describe('<PushPullButton/>', () => {
  let defaultProps: PropsType<PushPullButton>
  let repository: Repository

  afterEach(cleanup)

  beforeEach(async () => {
    const db = new TestGitHubUserDatabase()
    await db.reset()

    const issuesDb = new TestIssuesDatabase()
    await issuesDb.reset()

    const statsDb = new TestStatsDatabase()
    await statsDb.reset()
    const statsStore = new StatsStore(statsDb, new TestActivityMonitor())

    const repositoriesDb = new TestRepositoriesDatabase()
    await repositoriesDb.reset()
    const repositoriesStore = new RepositoriesStore(repositoriesDb)

    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )

    const pullRequestStore = new PullRequestStore(
      new TestPullRequestDatabase(),
      repositoriesStore
    )

    const githubUserStore = new GitHubUserStore(db)
    const issuesStore = new IssuesStore(issuesDb)

    const repositoryStateManager = new RepositoryStateCache(repo =>
      githubUserStore!.getUsersForRepository(repo)
    )

    const apiRepositoriesStore = new ApiRepositoriesStore(accountsStore)

    const appStore = new AppStore(
      githubUserStore,
      new CloningRepositoriesStore(),
      issuesStore,
      statsStore,
      new SignInStore(),
      accountsStore,
      repositoriesStore,
      pullRequestStore,
      repositoryStateManager,
      apiRepositoriesStore
    )

    const dispatcher = new InMemoryDispatcher(
      appStore,
      repositoryStateManager,
      statsStore
    )

    repository = await setupEmptyRepository()

    defaultProps = {
      aheadBehind: null,
      remoteName: null,
      networkActionInProgress: false,
      progress: null,
      dispatcher,
      lastFetched: null,
      tipState: TipState.Valid,
      rebaseInProgress: false,
      branchWasRebased: false,
      repository,
    }
  })

  describe('render', () => {
    it(`when no remote found on repository`, () => {
      const { container } = render(<PushPullButton {...defaultProps} />)

      expect(container).toMatchSnapshot()
    })

    it(`when remote set but no tracking branch set`, () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when detached HEAD`, async () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        tipState: TipState.Detached,
      }
      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when detached HEAD and rebase in progress`, () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        tipState: TipState.Detached,
        rebaseInProgress: true,
      }
      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when unborn branch`, async () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        tipState: TipState.Unborn,
      }
      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when up to date with tracking branch`, () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 0, behind: 0 },
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when ahead of tracking branch`, () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 5, behind: 0 },
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when behind tracking branch`, () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 0, behind: 5 },
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when pull.rebase enabled`, () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 2, behind: 5 },
        pullWithRebase: true,
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when progress shown`, () => {
      const progress: IFetchProgress = {
        kind: 'fetch',
        remote: 'origin',
        value: 50,
        title: 'something',
      }

      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 0, behind: 5 },
        progress,
        networkActionInProgress: true,
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when progress shown but network action off`, () => {
      const progress: IFetchProgress = {
        kind: 'fetch',
        remote: 'origin',
        value: 50,
        title: 'something',
      }

      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 0, behind: 5 },
        progress,
        networkActionInProgress: false,
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it(`when last fetch known`, () => {
      const fiveHoursAgo = moment('2019-01-01')
        .subtract(5, 'hours')
        .toDate()

      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 0, behind: 0 },
        lastFetched: fiveHoursAgo,
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it('when branch is not published to GitHub remote', () => {
      const githubRepository = new Repository(
        repository.path,
        1,
        {
          dbID: 1,
          name: 'desktop',
          owner: {
            login: 'desktop',
            endpoint: 'https://api.github.com/',
            id: 1234,
            hash: 'some-other-hash',
          },
          private: false,
          htmlURL: 'https://github.com/desktop/desktop',
          cloneURL: 'https://github.com/desktop/desktop.git',
          defaultBranch: 'development',
          fullName: 'desktop/desktop',
          parent: null,
          endpoint: 'https://api.github.com/',
          fork: false,
          hash: 'some-value',
        },
        false
      )

      const props = {
        ...defaultProps,
        remoteName: 'origin',
        repository: githubRepository,
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })

    it('when branch can be force pushed', () => {
      const props = {
        ...defaultProps,
        remoteName: 'origin',
        aheadBehind: { ahead: 4, behind: 5 },
        branchWasRebased: true,
      }

      const { container } = render(<PushPullButton {...props} />)

      expect(container).toMatchSnapshot()
    })
  })
})
