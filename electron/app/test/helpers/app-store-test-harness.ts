import { AccountsStore } from '../../src/lib/stores'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { PullRequestStore } from '../../src/lib/stores/pull-request-store'
import { SignInStore } from '../../src/lib/stores/sign-in-store'
import { IssuesStore } from '../../src/lib/stores/issues-store'
import { GitHubUserStore } from '../../src/lib/stores/github-user-store'
import { CommitStatusStore } from '../../src/lib/stores/commit-status-store'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { ApiRepositoriesStore } from '../../src/lib/stores/api-repositories-store'
import { CloningRepositoriesStore } from '../../src/lib/stores/cloning-repositories-store'
import { TestStatsStore } from './test-stats-store'
import { InMemoryStore, AsyncInMemoryStore } from './stores'
import { TestRepositoriesDatabase } from './databases/test-repositories-database'
import { TestGitHubUserDatabase } from './databases/test-github-user-database'
import { TestIssuesDatabase } from './databases/test-issues-database'
import { TestPullRequestDatabase } from './databases/test-pull-request-database'

/**
 * Creates a fresh AccountsStore backed by in-memory storage.
 */
export function createTestAccountsStore(): AccountsStore {
  return new AccountsStore(new InMemoryStore(), new AsyncInMemoryStore())
}

/**
 * Creates a fresh RepositoriesStore backed by a test database.
 */
export function createTestRepositoriesStore(): RepositoriesStore {
  return new RepositoriesStore(new TestRepositoriesDatabase())
}

/**
 * Creates a fresh PullRequestStore backed by test databases.
 */
export function createTestPullRequestStore(
  repositoriesStore?: RepositoriesStore
): PullRequestStore {
  return new PullRequestStore(
    new TestPullRequestDatabase(),
    repositoriesStore ?? createTestRepositoriesStore()
  )
}

/**
 * Creates a fresh SignInStore with a test AccountsStore.
 */
export function createTestSignInStore(
  accountsStore?: AccountsStore
): SignInStore {
  return new SignInStore(accountsStore ?? createTestAccountsStore())
}

/**
 * Creates a fresh GitHubUserStore backed by a test database.
 */
export function createTestGitHubUserStore(): GitHubUserStore {
  return new GitHubUserStore(new TestGitHubUserDatabase())
}

/**
 * Creates a fresh IssuesStore backed by a test database.
 */
export function createTestIssuesStore(): IssuesStore {
  return new IssuesStore(new TestIssuesDatabase())
}

/**
 * Creates a fresh CommitStatusStore.
 */
export function createTestCommitStatusStore(
  accountsStore?: AccountsStore
): CommitStatusStore {
  return new CommitStatusStore(accountsStore ?? createTestAccountsStore())
}

/**
 * Creates a RepositoryStateCache backed by a TestStatsStore.
 */
export function createTestRepositoryStateCache(): RepositoryStateCache {
  return new RepositoryStateCache(new TestStatsStore())
}

/**
 * Creates a CloningRepositoriesStore (no constructor dependencies).
 */
export function createTestCloningRepositoriesStore(): CloningRepositoriesStore {
  return new CloningRepositoriesStore()
}

/**
 * Creates an ApiRepositoriesStore.
 */
export function createTestApiRepositoriesStore(
  accountsStore?: AccountsStore
): ApiRepositoriesStore {
  return new ApiRepositoriesStore(accountsStore ?? createTestAccountsStore())
}

/**
 * A convenience interface for the common set of stores needed by many tests.
 */
export interface ITestStores {
  readonly accountsStore: AccountsStore
  readonly repositoriesStore: RepositoriesStore
  readonly pullRequestStore: PullRequestStore
  readonly signInStore: SignInStore
  readonly gitHubUserStore: GitHubUserStore
  readonly issuesStore: IssuesStore
  readonly commitStatusStore: CommitStatusStore
  readonly repositoryStateCache: RepositoryStateCache
  readonly cloningRepositoriesStore: CloningRepositoriesStore
  readonly apiRepositoriesStore: ApiRepositoriesStore
  readonly statsStore: TestStatsStore
}

/**
 * Creates a complete set of test stores, all wired together with
 * shared dependencies (e.g., the same AccountsStore and RepositoriesStore
 * are used by stores that depend on them).
 *
 * This is the primary entry point for tests that need multiple stores.
 */
export function createTestStores(): ITestStores {
  const statsStore = new TestStatsStore()
  const accountsStore = createTestAccountsStore()
  const repositoriesStore = createTestRepositoriesStore()
  const pullRequestStore = createTestPullRequestStore(repositoriesStore)
  const signInStore = createTestSignInStore(accountsStore)
  const gitHubUserStore = createTestGitHubUserStore()
  const issuesStore = createTestIssuesStore()
  const commitStatusStore = createTestCommitStatusStore(accountsStore)
  const repositoryStateCache = new RepositoryStateCache(statsStore)
  const cloningRepositoriesStore = createTestCloningRepositoriesStore()
  const apiRepositoriesStore = createTestApiRepositoriesStore(accountsStore)

  return {
    accountsStore,
    repositoriesStore,
    pullRequestStore,
    signInStore,
    gitHubUserStore,
    issuesStore,
    commitStatusStore,
    repositoryStateCache,
    cloningRepositoriesStore,
    apiRepositoriesStore,
    statsStore,
  }
}
