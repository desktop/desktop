import assert from 'node:assert/strict'
import { it, TestContext } from 'node:test'
import { createServer } from 'http'
import { dirname } from 'path'
import {
  CopilotClient,
  GitHubTokenProviderArgs,
  RuntimeConnection,
} from '@github/copilot-sdk'
import { getCopilotRuntimePath } from '../../src/lib/copilot-runtime'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { createCopilotTokenProvider } from '../../src/lib/stores/copilot-store'
import { Account } from '../../src/models/account'
import {
  createCopilotInMemorySessionFsProvider,
  getCopilotInMemorySessionFsConfig,
} from '../../src/lib/copilot-in-memory-session-fs-provider'
import { createTempDirectory } from '../helpers/temp'
import { AsyncInMemoryStore, InMemoryStore } from '../helpers/stores'

async function createClient(
  t: TestContext,
  env: Readonly<Record<string, string>> = {}
) {
  const directory = await createTempDirectory(t)
  const runtimeRoot = dirname(
    require.resolve(
      `@github/copilot-sdk-${process.platform}-${process.arch}/package.json`
    )
  )
  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({
      path: getCopilotRuntimePath(runtimeRoot),
    }),
    useLoggedInUser: false,
    workingDirectory: directory,
    env: {
      COPILOT_HOME: directory,
      COPILOT_GITHUB_TOKEN: '',
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
      GH_HOST: 'github.com',
      ...env,
    },
    sessionFs: getCopilotInMemorySessionFsConfig(
      directory,
      process.platform === 'win32' ? 'windows' : 'posix'
    ),
  })
  return { client, directory }
}

it('acquires refreshable credentials before creating a Copilot runtime session', async t => {
  const { client, directory } = await createClient(t)
  const acquisitionFailed = 'Test credential acquisition failed'
  const accountsStore = new AccountsStore(
    new InMemoryStore(),
    new AsyncInMemoryStore(),
    async () => {
      throw new Error(acquisitionFailed)
    }
  )
  const account = new Account(
    'octocat',
    'https://api.github.com',
    'test-access',
    [],
    '',
    1,
    'Octocat'
  )
  await accountsStore.addAccount(account, {
    accessToken: account.token,
    refreshToken: 'test-refresh',
    expiresAt: Date.now(),
  })
  const provider = createCopilotTokenProvider(accountsStore, account)
  assert.ok(provider)
  const tokenProvider = t.mock.fn((args: GitHubTokenProviderArgs) =>
    provider(args)
  )

  try {
    await assert.rejects(
      client.createSession({
        model: 'auto',
        configDirectory: directory,
        enableSessionStore: false,
        createSessionFsProvider: createCopilotInMemorySessionFsProvider,
        gitHubTokenProvider: tokenProvider,
        onPermissionRequest: async () => ({ kind: 'reject' }),
      }),
      /Unable to renew your GitHub session/
    )
    assert.strictEqual(tokenProvider.mock.callCount(), 1)
    assert.strictEqual(
      tokenProvider.mock.calls[0].arguments[0].reason,
      'initial'
    )
  } finally {
    await client.stop()
  }
})

it('passes a fractional Desktop token lifetime through native runtime validation', async t => {
  const now = 1_800_000_000_000
  t.mock.method(Date, 'now', () => now)
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(request.headers.authorization ?? '')
    response.writeHead(401, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ message: 'Test credentials rejected' }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  const { client, directory } = await createClient(t, {
    COPILOT_DEBUG_GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
  })
  const accountsStore = new AccountsStore(
    new InMemoryStore(),
    new AsyncInMemoryStore()
  )
  const account = new Account(
    'octocat',
    'https://api.github.com',
    'test-access',
    [],
    '',
    1,
    'Octocat'
  )
  await accountsStore.addAccount(account, {
    accessToken: account.token,
    refreshToken: 'test-refresh',
    expiresAt: now + 2 * 60 * 60 * 1000 + 500,
  })
  const provider = createCopilotTokenProvider(accountsStore, account)
  assert.ok(provider)

  try {
    await assert.rejects(
      client.createSession({
        model: 'auto',
        configDirectory: directory,
        enableSessionStore: false,
        createSessionFsProvider: createCopilotInMemorySessionFsProvider,
        gitHubTokenProvider: provider,
        onPermissionRequest: async () => ({ kind: 'reject' }),
      }),
      /GitHub token validation failed/
    )
    assert.ok(requests.length > 0)
    assert.ok(requests.every(value => value === `Bearer ${account.token}`))
  } finally {
    await client.stop()
  }
})
