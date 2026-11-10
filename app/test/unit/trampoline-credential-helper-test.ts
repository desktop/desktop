import assert from 'node:assert/strict'
import { after, before, describe, it, mock } from 'node:test'
import { Account, IAccountIdentity } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { TrampolineCommandIdentifier } from '../../src/lib/trampoline/trampoline-command'
import { RepositoriesDatabase } from '../../src/lib/databases'

const endpoint = 'https://api.github.com'
const alice = new Account('alice', endpoint, 'alice-token', [], '', 1, 'Alice')
const bob = new Account('bob', endpoint, 'bob-token', [], '', 2, 'Bob')
const github = new GitHubRepository('repo', new Owner('owner', endpoint, 1), 1)

class TestAccountsStore extends AccountsStore {
  public constructor(private current: ReadonlyArray<Account>) {
    super(new InMemoryStore(), new AsyncInMemoryStore())
  }

  public getAll() {
    return Promise.resolve(this.current)
  }

  public update(accounts: ReadonlyArray<Account>) {
    this.current = accounts
    this.emitUpdate(accounts)
  }

  public async leaseAccountToken(account: Account, _holder: string) {
    return { account, release: () => {} }
  }
}

class TestRepositoriesStore extends RepositoriesStore {
  public constructor(private current: ReadonlyArray<Repository>) {
    super(new TestRepositoriesDatabase())
  }

  public getAll() {
    return Promise.resolve(this.current)
  }

  public update(repositories: ReadonlyArray<Repository>) {
    this.current = repositories
    this.emitUpdate(repositories)
  }
}

function repository(login: string | null, path = '/repo') {
  return new Repository(
    path,
    1,
    github,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
}

describe('repository-aware credential trampoline', () => {
  let createHandler: typeof import('../../src/lib/trampoline/trampoline-credential-helper').createCredentialHelperTrampolineHandler
  let path = '/repo'
  let background = false
  let fallbackAccount: IAccountIdentity | undefined
  const prompt = mock.fn(
    async (_repository: Repository): Promise<Account | undefined> => undefined
  )
  const associate = mock.fn(
    async (repository: Repository, _endpoint: string): Promise<Repository> =>
      repository
  )

  before(async () => {
    const environment = await import(
      '../../src/lib/trampoline/trampoline-environment'
    )
    mock.module('../../src/lib/trampoline/trampoline-environment', {
      namedExports: {
        ...environment,
        getTrampolineEnvironmentPath: () => path,
        getIsBackgroundTaskEnvironment: () => background,
        getTrampolineFallbackAccount: () => fallbackAccount,
      },
    })
    mock.module('../../src/lib/trampoline/trampoline-ui-helper', {
      namedExports: {
        trampolineUIHelper: {
          promptForRepositoryAccount: prompt,
          associateRepositoryWithEndpoint: associate,
        },
      },
    })
    createHandler = (
      await import('../../src/lib/trampoline/trampoline-credential-helper')
    ).createCredentialHelperTrampolineHandler
  })

  after(() => mock.restoreAll())

  const command = (host = 'github.com') => ({
    identifier: TrampolineCommandIdentifier.CredentialHelper,
    parameters: ['get'],
    trampolineToken: 'test-token',
    stdin: `protocol=https\nhost=${host}\n\n`,
    environmentVariables: new Map<string, string>(),
  })

  it('persists only the chosen account after repairing a development-branch schema switch', async t => {
    const { createAssistedCommitRunHarness } = await import(
      '../helpers/assisted-commit-run'
    )
    const h = await createAssistedCommitRunHarness(t)
    h.appStore['updateRepositorySelectionAfterRepositoriesChanged'] = () => {}
    h.appStore['updateCopilotModelsForCurrentAccount'] = () => {}
    h.appStore['updateCopilotQuotaSnapshotsForCurrentAccount'] = () => {}
    h.appStore['refreshSelectedRepositoryAfterAccountChange'] = async () => {}
    const other = await h.stores.accountsStore.addAccount(bob)
    assert.ok(other)
    const db = h.stores.repositoriesStore['db']
    const name = db.name
    await db.delete()
    let legacy = new RepositoriesDatabase(name, 10)
    await legacy.open()
    t.after(() => db.delete())
    const bootstrap = new RepositoriesStore(legacy)
    const local = await bootstrap.addRepository('/repo', undefined)
    const anonymous = await bootstrap.upsertGitHubRepositoryFromMatch({
      account: new Account('', endpoint, '', [], '', -1, ''),
      owner: 'synthetic-owner',
      name: 'known-repository',
    })
    const unassigned = await bootstrap.setGitHubRepository(
      local,
      anonymous,
      null
    )
    legacy.close()
    legacy = new RepositoriesDatabase(name, 9)
    await legacy.open()
    assert.equal(
      legacy
        .backendDB()
        .transaction('gitHubRepositories')
        .objectStore('gitHubRepositories')
        .indexNames.contains('[ownerID+name]'),
      true
    )
    legacy.close()
    await db.open()
    h.appStore['adoptRepository'](unassigned)
    const gitStore = h.appStore['gitStoreCache'].get(unassigned)
    const picker = t.mock.fn(async (): Promise<Account | undefined> => other)
    h.appStore['promptForUnassignedRepositoryAccount'] = picker
    const handler = createHandler(
      h.stores.accountsStore,
      h.stores.repositoriesStore
    )
    const lease = t.mock.method(h.stores.accountsStore, 'leaseAccountToken')
    prompt.mock.mockImplementationOnce(repo =>
      h.dispatcher.ensureRepositoryAccount(repo)
    )
    picker.mock.mockImplementationOnce(async () => undefined)
    assert.equal(await handler(command()), undefined)
    assert.equal(lease.mock.callCount(), 0)
    assert.equal(
      (await h.appStore._getCurrentRepository(unassigned)).login,
      null
    )
    assert.equal(gitStore.repository.login, null)
    assert.equal(await db.gitHubRepositories.count(), 1)

    prompt.mock.mockImplementationOnce(repo =>
      h.dispatcher.ensureRepositoryAccount(repo)
    )
    const [credential] = await Promise.all([
      handler(command()),
      h.stores.repositoriesStore.upsertGitHubRepositoryFromMatch({
        account: other,
        owner: 'synthetic-owner',
        name: 'known-repository',
      }),
    ])
    assert.ok(credential)
    const fields = new Map(
      credential
        .trim()
        .split('\n')
        .map(line => {
          const index = line.indexOf('=')
          return [line.slice(0, index), line.slice(index + 1)]
        })
    )
    assert.equal(fields.get('username'), other.login)
    assert.equal(fields.get('password'), other.token)
    const current = await h.appStore._getCurrentRepository(unassigned)
    assert.equal(current.login, other.login)
    assert.notEqual(current.gitHubRepository?.dbID, anonymous.dbID)
    assert.equal(h.appStore['gitStoreCache'].get(current), gitStore)
    assert.equal(gitStore.repository.login, other.login)
    assert.equal(await db.gitHubRepositories.count(), 2)
    assert.equal(
      await db.gitHubRepositories
        .where('[ownerID+name+accountLogin]')
        .equals([anonymous.owner.id, anonymous.name, other.login])
        .count(),
      1
    )
    assert.equal(await handler(command()), credential)
    assert.equal(picker.mock.callCount(), 2)
    assert.equal(lease.mock.callCount(), 2)
  })

  it('uses the repository login, not the first account or URL username', async () => {
    const handler = createHandler(
      new TestAccountsStore([alice, bob]),
      new TestRepositoriesStore([repository('bob')])
    )
    const result = await handler({
      ...command(),
      stdin: 'protocol=https\nhost=github.com\nusername=alice\n\n',
    })
    assert.match(result ?? '', /username=bob/)
    assert.match(result ?? '', /password=bob-token/)
    assert.doesNotMatch(result ?? '', /alice-token/)
  })

  it('subscribes to repository assignments and account token updates', async () => {
    const accounts = new TestAccountsStore([alice, bob])
    const repositories = new TestRepositoriesStore([repository('alice')])
    const handler = createHandler(accounts, repositories)
    assert.match((await handler(command())) ?? '', /alice-token/)
    repositories.update([repository('bob')])
    assert.match((await handler(command())) ?? '', /bob-token/)
    accounts.update([bob.withToken('refreshed-token')])
    assert.match((await handler(command())) ?? '', /refreshed-token/)
  })

  it('does not overwrite updates with a late initial snapshot', async () => {
    const accounts = new TestAccountsStore([alice])
    const repositories = new TestRepositoriesStore([repository('alice')])
    let resolveAccounts: (accounts: ReadonlyArray<Account>) => void = () => {
      assert.fail('Initial account load has not started')
    }
    let resolveRepositories: (
      repositories: ReadonlyArray<Repository>
    ) => void = () => {
      assert.fail('Initial repository load has not started')
    }
    mock.method(
      accounts,
      'getAll',
      () =>
        new Promise<ReadonlyArray<Account>>(resolve => {
          resolveAccounts = resolve
        })
    )
    mock.method(
      repositories,
      'getAll',
      () =>
        new Promise<ReadonlyArray<Repository>>(resolve => {
          resolveRepositories = resolve
        })
    )
    const handler = createHandler(accounts, repositories)
    accounts.update([bob])
    repositories.update([repository('bob')])
    resolveAccounts([alice])
    resolveRepositories([repository('alice')])
    assert.match((await handler(command())) ?? '', /bob-token/)
  })

  it('prompts for an unassigned repository and uses the explicit choice', async () => {
    prompt.mock.mockImplementationOnce(async () => bob)
    const handler = createHandler(
      new TestAccountsStore([alice, bob]),
      new TestRepositoriesStore([repository(null)])
    )
    assert.match((await handler(command())) ?? '', /bob-token/)
    assert.equal(prompt.mock.calls.at(-1)?.arguments[0].login, null)
  })

  it('associates a repository whose GitHub remote was not recognized yet', async () => {
    const unrecognized = new Repository('/repo', 1, null, false)
    associate.mock.mockImplementationOnce(async () => repository(null))
    prompt.mock.mockImplementationOnce(async () => bob)
    const handler = createHandler(
      new TestAccountsStore([alice, bob]),
      new TestRepositoriesStore([unrecognized])
    )
    assert.match((await handler(command())) ?? '', /bob-token/)
    assert.equal(associate.mock.calls.at(-1)?.arguments[0], unrecognized)
    assert.equal(associate.mock.calls.at(-1)?.arguments[1], endpoint)
  })

  it('does not associate a repository with a host that is not GitHub', async () => {
    const count = associate.mock.callCount()
    const handler = createHandler(
      new TestAccountsStore([alice]),
      new TestRepositoriesStore([new Repository('/repo', 1, null, false)])
    )
    await handler({
      ...command('gitlab.example.com'),
      stdin:
        'protocol=https\nhost=gitlab.example.com\nwwwauth[]=Basic realm="GitLab"\n\n',
    })
    assert.equal(associate.mock.callCount(), count)
  })

  it('preserves a missing assignment and prompts for that login', async () => {
    const handler = createHandler(
      new TestAccountsStore([alice]),
      new TestRepositoriesStore([repository('bob')])
    )
    assert.equal(await handler(command()), undefined)
    assert.equal(prompt.mock.calls.at(-1)?.arguments[0].login, 'bob')
  })

  it('does not prompt or fall back during background work', async () => {
    background = true
    try {
      const count = prompt.mock.callCount()
      for (const login of [null, 'bob']) {
        const handler = createHandler(
          new TestAccountsStore([alice]),
          new TestRepositoriesStore([repository(login)])
        )
        assert.equal(await handler(command()), undefined)
      }
      assert.equal(prompt.mock.callCount(), count)
    } finally {
      background = false
    }
  })

  it('uses the fallback account only for an untracked path', async () => {
    path = '/cloning'
    fallbackAccount = bob
    try {
      const handler = createHandler(
        new TestAccountsStore([alice, bob]),
        new TestRepositoriesStore([repository('alice')])
      )
      assert.match((await handler(command())) ?? '', /bob-token/)
      fallbackAccount = undefined
      assert.equal(await handler(command()), undefined)
    } finally {
      path = '/repo'
      fallbackAccount = undefined
    }
  })

  it('prefers the assigned account over the fallback account', async () => {
    fallbackAccount = bob
    try {
      const handler = createHandler(
        new TestAccountsStore([alice, bob]),
        new TestRepositoriesStore([repository('alice')])
      )
      assert.match((await handler(command())) ?? '', /alice-token/)
    } finally {
      fallbackAccount = undefined
    }
  })

  it('only uses a signed-in fallback account', async () => {
    path = '/cloning'
    fallbackAccount = { endpoint, login: 'Bob' }
    try {
      const signedIn = createHandler(
        new TestAccountsStore([alice, bob]),
        new TestRepositoriesStore([])
      )
      assert.match((await signedIn(command())) ?? '', /bob-token/)

      const signedOut = createHandler(
        new TestAccountsStore([alice]),
        new TestRepositoriesStore([])
      )
      assert.equal(await signedOut(command()), undefined)
    } finally {
      path = '/repo'
      fallbackAccount = undefined
    }
  })

  it('never sends the account to a different endpoint', async () => {
    const other = new Account(
      'alice',
      'https://other.ghe.com/api/v3',
      'other-token',
      [],
      '',
      1,
      'Alice'
    )
    const handler = createHandler(
      new TestAccountsStore([alice, other]),
      new TestRepositoriesStore([repository('alice')])
    )
    assert.equal(await handler(command('other.ghe.com')), undefined)
  })

  it('rejects a different endpoint returned after an interactive prompt', async () => {
    prompt.mock.mockImplementationOnce(
      async () =>
        new Account(
          'alice',
          'https://other.ghe.com/api/v3',
          'other-token',
          [],
          '',
          1,
          'Alice'
        )
    )
    const handler = createHandler(
      new TestAccountsStore([alice]),
      new TestRepositoriesStore([repository(null)])
    )
    assert.equal(await handler(command()), undefined)
  })

  describe('when the request origin differs from the account origin', () => {
    const plain = (protocol: string, host = 'github.com') => ({
      ...command(host),
      stdin: `protocol=${protocol}\nhost=${host}\n\n`,
    })

    it('never sends the assigned account over plain HTTP', async () => {
      const handler = createHandler(
        new TestAccountsStore([alice, bob]),
        new TestRepositoriesStore([repository('bob')])
      )
      assert.doesNotMatch((await handler(plain('http'))) ?? '', /bob-token/)
      assert.match((await handler(plain('https'))) ?? '', /bob-token/)
    })

    it('never sends the fallback account over plain HTTP', async () => {
      path = '/cloning'
      fallbackAccount = bob
      try {
        const handler = createHandler(
          new TestAccountsStore([alice, bob]),
          new TestRepositoriesStore([])
        )
        assert.doesNotMatch((await handler(plain('http'))) ?? '', /bob-token/)
        assert.match((await handler(plain('https'))) ?? '', /bob-token/)
      } finally {
        path = '/repo'
        fallbackAccount = undefined
      }
    })

    it('never sends the assigned account to another port', async () => {
      const handler = createHandler(
        new TestAccountsStore([alice, bob]),
        new TestRepositoriesStore([repository('bob')])
      )
      assert.doesNotMatch(
        (await handler(plain('https', 'github.com:8443'))) ?? '',
        /bob-token/
      )
    })
  })
})
