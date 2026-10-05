import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import { chmod, copyFile } from 'fs/promises'
import { delimiter, join } from 'path'
import { exec, spawn } from 'dugite'
import { git } from '../../../src/lib/git'
import { Account } from '../../../src/models/account'
import { AccountsStore } from '../../../src/lib/stores/accounts-store'
import { IOAuthToken } from '../../../src/lib/oauth-token'
import { trampolineServer } from '../../../src/lib/trampoline/trampoline-server'
import { TrampolineCommandIdentifier } from '../../../src/lib/trampoline/trampoline-command'
import { createCredentialHelperTrampolineHandler } from '../../../src/lib/trampoline/trampoline-credential-helper'
import { InMemoryStore, AsyncInMemoryStore } from '../../helpers/stores'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'

const exe = process.platform === 'win32' ? '.exe' : ''

/** Make Desktop's credential helper available to Git as `credential-desktop`. */
async function installCredentialHelper(t: TestContext) {
  const binDir = await createTempDirectory(t)
  const helper = join(binDir, `git-credential-desktop${exe}`)
  await copyFile(
    join(
      __dirname,
      '../../../node_modules/desktop-trampoline/build/Release',
      `desktop-credential-helper-trampoline${exe}`
    ),
    helper
  )
  await chmod(helper, 0o755)
  return binDir
}

/** Answer one smart HTTP request with `git http-backend`. */
async function runHttpBackend(
  root: string,
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const header = (name: string) => {
    const value = req.headers[name]
    return typeof value === 'string' ? value : ''
  }
  const cgi = spawn(['http-backend'], root, {
    env: {
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: '1',
      REQUEST_METHOD: req.method ?? 'GET',
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      CONTENT_TYPE: header('content-type'),
      HTTP_CONTENT_ENCODING: header('content-encoding'),
      GIT_PROTOCOL: header('git-protocol'),
      REMOTE_USER: 'octocat',
      REMOTE_ADDR: '127.0.0.1',
    },
  })
  req.pipe(cgi.stdin)
  const chunks = new Array<Buffer>()
  cgi.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
  await new Promise(resolve => cgi.on('close', resolve))

  const output = Buffer.concat(chunks)
  const crlf = output.indexOf('\r\n\r\n')
  const end = crlf >= 0 ? crlf : output.indexOf('\n\n')
  const separator = crlf >= 0 ? 4 : 2
  let status = 200
  const headers: Record<string, string> = {}
  for (const line of output.subarray(0, end).toString().split(/\r?\n/)) {
    const colon = line.indexOf(':')
    const name = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (name.toLowerCase() === 'status') {
      status = parseInt(value, 10)
    } else if (name.length > 0) {
      headers[name] = value
    }
  }
  res.writeHead(status, headers).end(output.subarray(end + separator))
}

/**
 * Serve repositories under `root` over smart HTTP as an HTTP proxy, accepting
 * only access tokens for which `isValid` returns true, like GitHub does after
 * rotation. Proxying lets the remote use a host without a port, which is how
 * Desktop matches accounts to remotes.
 */
async function serveRepositories(
  t: TestContext,
  root: string,
  isValid: (token: string) => boolean,
  onAuthenticatedRequest: () => Promise<void>
) {
  const server = createServer(async (req, res) => {
    const authorization = req.headers.authorization ?? ''
    const token = authorization.startsWith('Basic ')
      ? Buffer.from(authorization.slice(6), 'base64')
          .toString()
          .split(':')
          .slice(1)
          .join(':')
      : undefined
    if (token === undefined || !isValid(token)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="GitHub"' })
      res.end()
      return
    }
    await onAuthenticatedRequest()
    await runHttpBackend(root, req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return (server.address() as AddressInfo).port
}

describe('Refreshable credentials in Git', () => {
  it('a running push keeps working while another consumer waits to renew its token', async t => {
    let clock = Date.now()
    const validTokens = new Set(['initial-access'])
    let renewals = 0
    const renew = async (): Promise<IOAuthToken> => {
      // Renewal revokes every token issued before it, as GitHub does.
      validTokens.clear()
      renewals++
      const accessToken = `renewed-access-${renewals}`
      validTokens.add(accessToken)
      return {
        accessToken,
        refreshToken: `renewed-refresh-${renewals}`,
        expiresAt: clock + 8 * 60 * 60 * 1000,
      }
    }

    const root = await createTempDirectory(t)
    await exec(['init', '--bare', 'remote.git'], root)

    const account = new Account(
      'octocat',
      'http://github.test/api/v3',
      'initial-access',
      [],
      '',
      1,
      'Octocat'
    )
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore(),
      renew,
      () => clock
    )
    await store.addAccount(account, {
      accessToken: 'initial-access',
      refreshToken: 'initial-refresh',
      // Just outside the renewal window when Git asks for it.
      expiresAt: clock + 11 * 60 * 1000,
    })
    trampolineServer.registerCommandHandler(
      TrampolineCommandIdentifier.CredentialHelper,
      createCredentialHelperTrampolineHandler(store)
    )

    let otherConsumer: Promise<Account> | undefined
    const port = await serveRepositories(
      t,
      root,
      token => validTokens.has(token),
      async () => {
        if (otherConsumer !== undefined) {
          return
        }
        // Between Git's first authenticated request and the next one, the
        // token moves inside the renewal window and an API request needs it.
        clock += 2 * 60 * 1000
        otherConsumer = store.getAccountWithFreshToken(account)
      }
    )

    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })
    const binDir = await installCredentialHelper(t)

    await git(
      [
        '-c',
        `http.proxy=http://127.0.0.1:${port}`,
        'push',
        'http://github.test/remote.git',
        'HEAD:refs/heads/main',
      ],
      repository.path,
      'push',
      { env: { PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` } }
    )

    const local = await exec(['rev-parse', 'HEAD'], repository.path)
    const remote = await exec(
      ['--git-dir', join(root, 'remote.git'), 'rev-parse', 'refs/heads/main'],
      root
    )
    assert.equal(remote.stdout, local.stdout)

    // Once Git has exited, the waiting consumer renews the token.
    assert.ok(otherConsumer)
    assert.equal((await otherConsumer).token, 'renewed-access-1')
    assert.equal(renewals, 1)
  })
})
