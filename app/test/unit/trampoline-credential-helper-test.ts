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
        trampolineUIHelper: { promptForRepositoryAccount: prompt },
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
})
