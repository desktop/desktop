import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { SignInStep, SignInStore } from '../../src/lib/stores/sign-in-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import {
  getAccountForRemote,
  getAccountForRepositoryDetails,
  getAccountsForRemote,
  getRepositoryAccountBinding,
  getRepositoryAccountCredentialOrigins,
  RepositoryAccountUnavailableError,
  setRepositoryAccountBinding,
} from '../../src/lib/repository-account'
import { findGitHubTrampolineAccount } from '../../src/lib/trampoline/find-account'
import { matchGitHubRepository } from '../../src/lib/repository-matching'
import { findAccountForRemoteURL } from '../../src/lib/find-account'
import { exec } from 'dugite'
import { createTempDirectory } from '../helpers/temp'
import { withTrampolineEnv } from '../../src/lib/trampoline/trampoline-environment'
import { trampolineServer } from '../../src/lib/trampoline/trampoline-server'
import { createCredentialHelperTrampolineHandler } from '../../src/lib/trampoline/trampoline-credential-helper'
import { TrampolineCommandIdentifier } from '../../src/lib/trampoline/trampoline-command'

const endpoint = 'https://api.github.com'
const work = new Account(
  'work',
  endpoint,
  'fake-work-token',
  [],
  '',
  1,
  'Work',
  'free'
)
const personal = new Account(
  'personal',
  endpoint,
  'fake-personal-token',
  [],
  '',
  2,
  'Personal',
  'free'
)
const accounts = [work, personal]
const url = 'https://github.com/example/project.git'

describe('Custom repository accounts', () => {
  const channel = __RELEASE_CHANNEL__
  beforeEach(() => {
    Object.defineProperty(globalThis, '__RELEASE_CHANNEL__', {
      value: 'custom',
      configurable: true,
    })
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
    Object.defineProperty(globalThis, '__RELEASE_CHANNEL__', {
      value: channel,
      configurable: true,
    })
  })

  it('preserves the existing host default until a repository is bound', () => {
    assert.equal(getAccountForRemote(accounts, url), work)
    assert.equal(getRepositoryAccountBinding(url), null)
    assert.deepEqual(getRepositoryAccountCredentialOrigins(), [])
  })

  it('selects accounts independently for different repositories', () => {
    setRepositoryAccountBinding(url, personal)
    assert.equal(getAccountForRemote(accounts, url), personal)
    assert.equal(
      getAccountForRemote(accounts, 'https://github.com/example/other'),
      work
    )
    assert.equal(
      getAccountForRepositoryDetails(accounts, endpoint, 'example', 'project'),
      personal
    )
    assert.equal(matchGitHubRepository(accounts, url)?.account, personal)
  })

  it('normalizes HTTPS, SSH, case, git suffixes and LFS paths', () => {
    setRepositoryAccountBinding(url, personal)
    for (const remote of [
      'https://GITHUB.COM/Example/Project/',
      'git@github.com:EXAMPLE/PROJECT.git',
      'https://github.com/example/project.git/info/lfs',
      'https://github.com/example/project.git/info/lfs/objects/batch',
    ]) {
      assert.equal(getAccountForRemote(accounts, remote), personal)
    }
  })

  it('stores only the stable account identity, not its token', () => {
    setRepositoryAccountBinding(url, personal)
    assert.deepEqual(getRepositoryAccountBinding(url), {
      endpoint,
      id: 2,
      login: 'personal',
    })
    const stored = localStorage.getItem(localStorage.key(0) ?? '')
    assert.ok(stored)
    assert.equal(stored.includes(personal.token), false)
  })

  it('does not fall back when the chosen account is signed out or missing its token', async () => {
    setRepositoryAccountBinding(url, personal)
    assert.equal(getAccountForRemote([work], url), null)
    assert.equal(getAccountForRemote([work, personal.withToken('')], url), null)
    assert.equal(matchGitHubRepository([work], url), null)
    assert.equal(await findAccountForRemoteURL(url, [work]), null)
    setRepositoryAccountBinding(url, null)
    assert.equal(getAccountForRemote([work], url), work)
  })

  it('does not match another host, port, or downgraded HTTP transport', () => {
    setRepositoryAccountBinding(url, personal)
    assert.equal(
      getAccountForRemote(accounts, 'http://github.com/example/project'),
      null
    )
    assert.equal(
      getAccountForRemote(accounts, 'https://github.com:8443/example/project'),
      null
    )
    assert.equal(
      getAccountForRemote(
        accounts,
        'https://github.com.evil.example/example/project'
      ),
      null
    )
    assert.deepEqual(
      getAccountsForRemote(
        accounts,
        'https://gnaudio.visualstudio.com/JabraSDK-v2/_git/jabra-node-sdk'
      ),
      []
    )
    assert.throws(() =>
      setRepositoryAccountBinding('https://example.org/owner/repo', personal)
    )
  })

  it('requests paths only for bound GitHub hosts, preserving Azure credentials', () => {
    setRepositoryAccountBinding(url, personal)
    assert.deepEqual(getRepositoryAccountCredentialOrigins(), [
      'https://github.com',
    ])
  })

  it('passes host-scoped configuration which real Git understands', async t => {
    const directory = await createTempDirectory(t)
    t.mock.method(trampolineServer, 'getPort', async () => 31337)
    setRepositoryAccountBinding(url, personal)
    await withTrampolineEnv(async env => {
      const options = {
        env: {
          ...process.env,
          ...env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        },
      }
      const github = await exec(
        ['config', '--get-urlmatch', 'credential.useHttpPath', url],
        directory,
        options
      )
      assert.equal(github.exitCode, 0)
      assert.equal(github.stdout.trim(), 'true')
      const azure = await exec(
        [
          'config',
          '--get-urlmatch',
          'credential.useHttpPath',
          'https://gnaudio.visualstudio.com/JabraSDK-v2/_git/jabra-node-sdk',
        ],
        directory,
        options
      )
      assert.equal(azure.exitCode, 1)
      assert.equal(azure.stdout, '')
    }, directory)
  })

  it('responds to Git credential protocol requests with the selected identity', async () => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await store.addAccount(work)
    await store.addAccount(personal)
    setRepositoryAccountBinding(url, personal)
    const handler = createCredentialHelperTrampolineHandler(store)
    const response = await handler({
      identifier: TrampolineCommandIdentifier.CredentialHelper,
      trampolineToken: 'fake-test-trampoline',
      parameters: ['get'],
      environmentVariables: new Map(),
      stdin: 'protocol=https\nhost=github.com\npath=example/project.git\n\n',
    })
    assert.ok(response?.includes('username=personal'))
    assert.ok(response?.includes('password=fake-personal-token'))
    assert.equal(response?.includes('fake-work-token'), false)
  })

  it('uses stable user IDs after a login rename', () => {
    setRepositoryAccountBinding(url, personal)
    const renamed = new Account(
      'renamed',
      endpoint,
      'new-fake-token',
      [],
      '',
      2,
      'Personal',
      'free'
    )
    assert.equal(getAccountForRemote([work, renamed], url), renamed)
  })

  it('rejects malformed saved selections instead of silently using another account', () => {
    setRepositoryAccountBinding(url, personal)
    const key = localStorage.key(0)
    assert.ok(key)
    localStorage.setItem(key, '{"id":"invalid"}')
    assert.throws(
      () => getAccountForRemote(accounts, url),
      /saved repository account is invalid/
    )
  })

  it('persists both same-host accounts and replaces only the same identity', async () => {
    const data = new InMemoryStore()
    const secure = new AsyncInMemoryStore()
    const store = new AccountsStore(data, secure)
    await store.addAccount(work)
    await store.addAccount(personal)
    await store.addAccount(personal.withToken('refreshed-fake-token'))
    const loaded = new AccountsStore(data, secure)
    const saved = await loaded.getAll()
    assert.equal(saved.length, 2)
    assert.equal(saved[0].token, work.token)
    assert.equal(saved[1].token, 'refreshed-fake-token')
    assert.equal(data.getItem('users')?.includes('refreshed-fake-token'), false)
    await loaded.removeAccount(personal)
    assert.deepEqual(
      (await loaded.getAll()).map(a => a.login),
      ['work']
    )
  })

  it('adding a second account starts OAuth without signing the first out', async () => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await store.addAccount(work)
    const signIn = new SignInStore(store)
    await store.getAll()
    signIn.beginDotComSignIn()
    assert.equal(signIn.getState()?.kind, SignInStep.Authentication)
    assert.equal((await store.getAll()).length, 1)
    signIn.reset()
    assert.equal((await store.getAll()).length, 1)
  })

  it('provides exactly the bound credential to Git and fails closed on sign-out', async () => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await store.addAccount(work)
    await store.addAccount(personal)
    setRepositoryAccountBinding(url, personal)
    assert.equal(
      (await findGitHubTrampolineAccount(store, url))?.token,
      personal.token
    )
    assert.equal(
      (
        await findGitHubTrampolineAccount(
          store,
          'https://github.com/example/other'
        )
      )?.token,
      work.token
    )
    await store.removeAccount(personal)
    await assert.rejects(
      () => findGitHubTrampolineAccount(store, url),
      RepositoryAccountUnavailableError
    )
  })

  it('leaves official builds on the existing single-account behavior', async () => {
    setRepositoryAccountBinding(url, personal)
    Object.defineProperty(globalThis, '__RELEASE_CHANNEL__', {
      value: 'production',
      configurable: true,
    })
    assert.equal(getAccountForRemote(accounts, url), work)
    assert.deepEqual(getRepositoryAccountCredentialOrigins(), [])
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await store.addAccount(work)
    await store.addAccount(personal)
    assert.deepEqual(
      (await store.getAll()).map(a => a.login),
      ['personal']
    )
  })
})
