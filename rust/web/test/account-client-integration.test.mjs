import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  access,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import WebSocket from 'ws'

const root = fileURLToPath(new URL('../../..', import.meta.url)),
  binary = path.join(root, 'rust/target/debug/desktop-rs')
const secrets = [
  'account-client-alice-private-381',
  'account-client-bob-private-714',
]
async function until(check, label) {
  const deadline = performance.now() + 12000
  while (performance.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(typeof label === 'function' ? label() : label)
}
function button(container, label) {
  return [...container.querySelectorAll('button')].find(
    value => value.textContent === label
  )
}
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'"

test('production localhost account reviews pin GitHub actors, clear same-root views and preserve saved-record worktree scope', async () => {
  const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'desktop-account-client-')
    ),
    repo = path.join(temporary, 'repository with spaces'),
    linked = path.join(temporary, 'linked worktree'),
    config = path.join(temporary, 'repositories.json'),
    tools = path.join(temporary, 'bin'),
    scenario = path.join(temporary, 'scenario.json'),
    ghLog = path.join(temporary, 'gh.jsonl'),
    transfers = path.join(temporary, 'forbidden-transfer')
  const programs = spawnSync(
    'python3',
    [
      '-c',
      'import json,shutil,sys;print(json.dumps([sys.executable,shutil.which("git")]))',
    ],
    { encoding: 'utf8' }
  )
  assert.equal(programs.status, 0, programs.stderr)
  const [python, realGit] = JSON.parse(programs.stdout),
    shell = spawnSync(realGit, ['var', 'GIT_SHELL_PATH'], { encoding: 'utf8' })
  assert.equal(shell.status, 0, shell.stderr)
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(temporary, 'global'),
    GIT_OPTIONAL_LOCKS: '0',
    GH_CONFIG_DIR: path.join(temporary, 'gh-config'),
    ACCOUNT_CLIENT_SCENARIO: scenario,
    ACCOUNT_CLIENT_LOG: ghLog,
    PATH: [tools, process.env.PATH].join(path.delimiter),
  }
  for (const key of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN',
    'GH_REPO',
    'GH_HOST',
    'GH_DEBUG',
    'DEBUG',
  ])
    delete env[key]
  const calls = [],
    replies = new Map(),
    sockets = [],
    errors = []
  let server, dom
  function git(...args) {
    const result = spawnSync(realGit, ['-C', repo, ...args], {
      env,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  async function signedOut(value) {
    await writeFile(scenario + '.next', JSON.stringify({ signed_out: value }), {
      mode: 0o600,
    })
    await rename(scenario + '.next', scenario)
  }
  async function entries() {
    try {
      return (await readFile(ghLog, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
  async function registry() {
    return JSON.parse(await readFile(config, 'utf8'))
  }
  try {
    await mkdir(repo)
    await mkdir(tools)
    await signedOut(false)
    await writeFile(
      path.join(tools, 'gh'),
      `#!${python}
import json,os,sys
from pathlib import Path
a=sys.argv[1:];signed_out=json.loads(Path(os.environ['ACCOUNT_CLIENT_SCENARIO']).read_text())['signed_out']
alice,bob=${JSON.stringify(secrets)}
login=a[a.index('--user')+1] if '--user' in a else None
token=os.environ.get('GH_TOKEN',bob)
actor='alicecase' if token==alice else 'bobcase' if token==bob else None
kind='token' if a[:2]==['auth','token'] else 'catalog' if a[:2]==['auth','status'] else 'api' if a and a[0]=='api' else 'metadata' if a[:2]==['repo','view'] else 'typed'
with open(os.environ['ACCOUNT_CLIENT_LOG'],'a') as log:log.write(json.dumps({'kind':kind,'login':login,'actor':actor,'args':a})+'\\n')
if kind=='catalog':
 rows=[{'host':'github.com','login':'BobCase','active':True,'state':'success','tokenSource':'keyring','gitProtocol':'https'}]
 if not signed_out:rows.append({'host':'github.com','login':'AliceCase','active':False,'state':'success','tokenSource':'keyring','gitProtocol':'https'})
 print(json.dumps({'hosts':{'github.com':rows}}));sys.exit(0)
if kind=='token':
 if login=='AliceCase' and signed_out:sys.exit(4)
 if login not in (None,'AliceCase','BobCase'):sys.exit(4)
 print(alice if login=='AliceCase' else bob);sys.exit(0)
repo={'id':2001,'full_name':'fork/repo','name':'repo','owner':{'login':'fork'},'html_url':'https://github.com/fork/repo','private':True,'fork':actor=='alicecase','parent':{'full_name':'parent/repo','html_url':'https://github.com/parent/repo'} if actor=='alicecase' else None}
if kind=='api':
 if '--method' not in a or a[a.index('--method')+1]!='GET' or actor is None or any(os.environ.get(key)!=token for key in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']):sys.exit(93)
 endpoint=a[-1]
 if endpoint=='/user':value={'id':101 if actor=='alicecase' else 202,'login':actor,'plan':{'name':'pro'}}
 elif endpoint=='/repos/fork/repo':value=repo
 elif '/rules/branches/' in endpoint:value=[]
 else:sys.exit(94)
 print(json.dumps(value));sys.exit(0)
if kind=='metadata':
 print(json.dumps({'nameWithOwner':'fork/repo','url':'https://github.com/fork/repo','isFork':repo['fork'],'parent':None if repo['parent'] is None else {'nameWithOwner':'parent/repo','url':'https://github.com/parent/repo'}}));sys.exit(0)
if a[:2] not in (['pr','list'],['pr','view']):sys.exit(95)
if actor=='alicecase' and any(os.environ.get(key)!=alice for key in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']):sys.exit(96)
name='Alice' if actor=='alicecase' else 'Bob'
value=[{'number':7,'title':name+' list','state':'OPEN','url':'https://github.com/fork/repo/pull/7'}] if a[1]=='list' else {'number':7,'title':name+' detail','state':'OPEN','headRefOid':'a'*40}
print(json.dumps(value))
`,
      { mode: 0o700 }
    )
    await writeFile(
      path.join(tools, 'git'),
      `#!${shell.stdout.trim()}
command=
skip=0
for argument do
 if [ "$skip" = 1 ]; then skip=0; continue; fi
 case "$argument" in
 -c|-C|--git-dir|--work-tree|--namespace) skip=1 ;;
 --no-pager|--paginate|--literal-pathspecs|--no-optional-locks|--git-dir=*|--work-tree=*) ;;
 *) command="$argument"; break ;;
 esac
done
forbidden=0
case "$command" in fetch|push|pull|clone) forbidden=1 ;;
ls-remote) forbidden=1; for argument do [ "$argument" = --get-url ] && forbidden=0; done ;;
remote) for argument do case "$argument" in update|prune|--fetch|-f) forbidden=1 ;; esac; done ;;
esac
if [ "$forbidden" = 1 ]; then printf forbidden > ${shellQuote(
        transfers
      )}; exit 97; fi
exec ${shellQuote(realGit)} "$@"
`,
      { mode: 0o700 }
    )
    git('init', '-qb', 'main')
    git('config', 'user.name', 'Saved Author')
    git('config', 'user.email', 'saved-author@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    await writeFile(path.join(repo, 'file.txt'), 'preserved bytes\n')
    git('add', '--', 'file.txt')
    git('commit', '-qm', 'base')
    git('remote', 'add', 'z-fork', 'https://github.com/fork/repo.git')
    git('worktree', 'add', '-qb', 'linked-account', linked)
    const before = {
      author: git('config', '--get-regexp', '^user\\.'),
      refs: git('for-each-ref', '--format=%(refname)%00%(objectname)'),
      index: await readFile(path.join(repo, '.git/index')),
      working: await readFile(path.join(repo, 'file.txt')),
    }
    const seeded = spawnSync(
      binary,
      ['-C', repo, '--config', config, 'repository-context', '--refresh'],
      { env, encoding: 'utf8' }
    )
    assert.equal(seeded.status, 0, seeded.stderr)
    assert.equal(JSON.parse(seeded.stdout).status, 'verified')
    server = spawn(
      binary,
      ['-C', repo, '--config', config, 'serve', '--port', '0'],
      { env, stdio: ['ignore', 'ignore', 'pipe'] }
    )
    let output = ''
    server.stderr.on('data', data => {
      output += data.toString()
    })
    await until(
      () => output.includes('Open http://'),
      'account fixture bridge did not start'
    )
    const url = /Open (http:\/\/[^\s]+)/.exec(output)[1],
      html = await (await fetch(url.split('#')[0])).text(),
      bundled = await build({
        entryPoints: [path.join(root, 'rust/web/client.js')],
        bundle: true,
        write: false,
        format: 'iife',
        logLevel: 'silent',
      }),
      virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', error => errors.push(error))
    class BrowserSocket extends WebSocket {
      constructor(address) {
        super(address, {
          origin: new URL(address).origin.replace('ws:', 'http:'),
        })
        sockets.push(this)
        this.on('message', data => {
          const reply = JSON.parse(data.toString())
          if (Number.isSafeInteger(reply.id)) replies.set(reply.id, reply)
        })
      }
      send(data, ...args) {
        calls.push(JSON.parse(data))
        return super.send(data, ...args)
      }
    }
    dom = new JSDOM(html, {
      url,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole,
    })
    dom.window.TextEncoder = globalThis.TextEncoder
    dom.window.WebSocket = BrowserSocket
    dom.window.eval(bundled.outputFiles[0].text)
    const document = dom.window.document
    await until(
      () =>
        document.querySelector('#connection').textContent === 'Ready' &&
        !document.querySelector('#create-branch button').disabled,
      'account client did not initialize'
    )
    const account = document.querySelector('.repository-account'),
      github = document.querySelector('.github-panel'),
      management = document.querySelector('.management-panel'),
      contribution = document.querySelector('.repository-context')
    function setInput(element, value) {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      ).set.call(element, value)
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }
    async function ready() {
      await until(
        () =>
          !button(account, 'Load repository account').disabled &&
          !button(github, 'Authentication').disabled,
        'account controls did not become ready'
      )
    }
    function expectGitHubBasis(expected) {
      const request = calls
        .filter(call => call.method === 'github')
        .at(-1).request
      assert.deepEqual(Object.keys(request).sort(), ['account_basis', 'action'])
      assert.equal(request.account_basis, expected)
    }
    function snapshotBasis() {
      return calls
        .filter(call => call.method === 'snapshot')
        .map(call => replies.get(call.id)?.result?.repository_account?.basis)
        .filter(value => value !== undefined)
        .at(-1)
    }
    async function loadAccount() {
      await ready()
      button(account, 'Load repository account').click()
      await until(
        () =>
          account.querySelector('select') &&
          !button(account, 'Load repository account').disabled,
        () => 'account did not load: ' + account.textContent
      )
    }
    function choose(value) {
      const select = account.querySelector('select')
      select.value = value
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    }
    async function reviewAccount() {
      button(account, 'Review repository account').click()
      await until(
        () =>
          account.querySelector('article') &&
          !button(account, 'Review repository account').disabled,
        () => 'account review did not load: ' + account.textContent
      )
    }
    async function saveAccount() {
      assert.equal(
        button(account, 'Confirm repository account').disabled,
        false
      )
      button(account, 'Confirm repository account').click()
      await until(
        () =>
          account.textContent.includes('Repository account saved.') &&
          !button(account, 'Load repository account').disabled,
        () => 'account save did not finish: ' + account.textContent
      )
      await ready()
    }
    await loadAccount()
    assert.equal(account.querySelector('select').value, 'effective')
    const originalScope = (await registry()).records[0].id,
      effectiveBasis = replies.get(
        calls.find(call => call.method === 'repository_account').id
      ).result.basis
    assert.equal(typeof effectiveBasis, 'string')
    assert.equal(snapshotBasis(), effectiveBasis)
    button(github, 'Pull requests').click()
    await until(
      () => github.textContent.includes('Bob list'),
      () => 'effective GitHub list did not load: ' + github.textContent
    )
    expectGitHubBasis(effectiveBasis)
    await ready()
    github.querySelector('.github-items button').click()
    await until(
      () => github.textContent.includes('Bob detail'),
      'effective GitHub detail did not load'
    )
    expectGitHubBasis(effectiveBasis)
    await ready()
    button(account, 'Refresh available accounts').click()
    await until(
      () =>
        account.textContent.includes('AliceCase') &&
        !button(account, 'Refresh available accounts').disabled,
      'account catalog did not load'
    )
    assert.equal(account.querySelector('select').value, 'effective')
    choose('["github.com","alicecase"]')
    await reviewAccount()
    assert(
      account.textContent.includes(
        'Verified account: github.com/alicecase (GitHub ID 101)'
      )
    )
    assert.equal(
      calls.filter(call => call.method === 'set_repository_account').length,
      0
    )
    await saveAccount()
    const assigned = (await registry()).records.find(
      record => record.id === originalScope
    )
    assert.deepEqual(assigned.account.assignment, {
      mode: 'assigned',
      host: 'github.com',
      login: 'AliceCase',
      id: 101,
    })
    assert.equal(assigned.account.association.remote_name, 'z-fork')
    assert.equal(assigned.account.source_remote, 'z-fork')
    assert.equal(
      git('config', '--get', 'remote.upstream.url').trim(),
      'https://github.com/parent/repo.git'
    )
    assert(!github.textContent.includes('Bob detail'))
    assert(!github.textContent.includes('Bob list'))
    assert.equal(button(github, 'Merge reviewed head'), undefined)
    const set = calls.find(call => call.method === 'set_repository_account')
    assert.deepEqual(Object.keys(set).sort(), [
      'basis',
      'id',
      'method',
      'repository_id',
      'target',
    ])
    assert.deepEqual(set.target, {
      mode: 'assigned',
      host: 'github.com',
      login: 'AliceCase',
    })
    assert.equal(typeof set.basis, 'string')
    assert.deepEqual(
      Object.keys(
        calls.find(call => call.method === 'repository_account_preview')
      ).sort(),
      ['id', 'method', 'repository_id', 'target']
    )
    const assignedBasis = replies.get(set.id).result.basis
    assert.notEqual(assignedBasis, effectiveBasis)
    await until(
      () => snapshotBasis() === assignedBasis,
      'assigned account was not reflected in the repository snapshot'
    )
    const staleRequest = {
        id: 1_000_001,
        method: 'github',
        repository_id: set.repository_id,
        request: {
          account_basis: effectiveBasis,
          action: { type: 'pull_requests', state: 'open', limit: 30 },
        },
      },
      beforeStale = (await entries()).length
    sockets[0].send(JSON.stringify(staleRequest))
    await until(
      () => replies.has(staleRequest.id),
      'stale GitHub request did not receive a response'
    )
    assert.match(
      replies.get(staleRequest.id).error,
      /Repository account changed/
    )
    assert.equal((await entries()).length, beforeStale)
    button(contribution, 'Load contribution settings').click()
    await until(
      () =>
        contribution.textContent.includes(
          'Parent repository: github.com/parent/repo'
        ) && !button(contribution, 'Load contribution settings').disabled,
      () => 'assigned fork metadata did not load: ' + contribution.textContent
    )
    assert(contribution.textContent.includes('Fetch remote: z-fork'))
    button(github, 'Pull requests').click()
    await until(
      () => github.textContent.includes('Alice list'),
      () => 'assigned GitHub actor was not used: ' + github.textContent
    )
    expectGitHubBasis(assignedBasis)
    await ready()
    await signedOut(true)
    button(account, 'Refresh available accounts').click()
    await until(
      () =>
        account.textContent.includes('named assignment is retained') &&
        !button(account, 'Refresh available accounts').disabled,
      'signed-out assignment was not retained'
    )
    assert.equal(
      account.querySelector('select').value,
      '["github.com","alicecase"]'
    )
    const typedBefore = (await entries()).filter(
      entry => entry.kind === 'typed'
    ).length
    button(github, 'Pull requests').click()
    await until(
      () =>
        github.textContent.includes('signed out or unavailable') &&
        !button(github, 'Authentication').disabled,
      () => 'signed-out operation did not fail honestly: ' + github.textContent
    )
    expectGitHubBasis(assignedBasis)
    assert.equal(
      (await entries()).filter(entry => entry.kind === 'typed').length,
      typedBefore
    )
    assert.equal(
      (await registry()).records.find(record => record.id === originalScope)
        .account.assignment.id,
      101
    )
    button(management, 'Refresh worktrees').click()
    await until(
      () =>
        [...management.querySelectorAll('li')].some(item =>
          item.textContent.includes(linked)
        ) && !button(management, 'Refresh worktrees').disabled,
      'linked worktree did not load'
    )
    const linkedItem = [...management.querySelectorAll('li')].find(item =>
      item.textContent.includes(linked)
    )
    button(linkedItem, 'Open worktree').click()
    await until(
      () =>
        document.querySelector('#repository').textContent === linked &&
        !button(account, 'Load repository account').disabled,
      'explicit worktree open did not complete'
    )
    assert.equal(
      calls.filter(call => call.method === 'open_worktree').length,
      1
    )
    await loadAccount()
    assert(
      account.textContent.includes(
        'Current assignment: github.com/AliceCase (GitHub ID 101)'
      )
    )
    const moved = (await registry()).records.find(
      record => record.id === originalScope
    )
    assert.equal(moved.path, linked)
    assert.equal((await registry()).records.length, 1)
    choose('none')
    await reviewAccount()
    await saveAccount()
    assert.equal(account.querySelector('select').value, 'none')
    const disabledBasis = replies.get(
      calls.filter(call => call.method === 'set_repository_account').at(-1).id
    ).result.basis
    assert.notEqual(disabledBasis, assignedBasis)
    await until(
      () => snapshotBasis() === disabledBasis,
      'disabled account was not reflected in the repository snapshot'
    )
    assert.equal(
      (await registry()).records.find(record => record.id === originalScope)
        .account.source_remote,
      'z-fork'
    )
    const beforeNone = (await entries()).length
    button(github, 'Pull requests').click()
    await until(
      () =>
        github.textContent.includes('No GitHub account is assigned') &&
        !button(github, 'Authentication').disabled,
      () =>
        'None did not disable typed GitHub API operation: ' + github.textContent
    )
    expectGitHubBasis(disabledBasis)
    assert.equal((await entries()).length, beforeNone)
    const open = document.querySelector('#open-repository')
    await until(
      () => !open.querySelector('button').disabled,
      'ordinary repository open was not ready'
    )
    setInput(open.elements.namedItem('path'), repo)
    open.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true })
    )
    await until(
      () =>
        document.querySelector('#repository').textContent === repo &&
        !button(account, 'Load repository account').disabled,
      'ordinary directory open did not finish'
    )
    await loadAccount()
    assert.equal(account.querySelector('select').value, 'effective')
    const records = (await registry()).records,
      independent = records.find(record => record.path === repo)
    assert.notEqual(independent.id, originalScope)
    assert.deepEqual(independent.account.assignment, { mode: 'effective' })
    assert.deepEqual(
      records.find(record => record.id === originalScope).account.assignment,
      { mode: 'none' }
    )
    assert.equal(
      calls.filter(call => call.method === 'open_repository').length,
      1
    )
    assert.equal(
      calls.filter(call => call.method === 'set_repository_account').length,
      2
    )
    assert.equal(git('config', '--get-regexp', '^user\\.'), before.author)
    assert.equal(
      git('for-each-ref', '--format=%(refname)%00%(objectname)'),
      before.refs
    )
    assert.deepEqual(
      await readFile(path.join(repo, '.git/index')),
      before.index
    )
    assert.deepEqual(
      await readFile(path.join(repo, 'file.txt')),
      before.working
    )
    assert(
      !secrets.some(
        secret =>
          document.body.textContent.includes(secret) ||
          JSON.stringify(calls).includes(secret) ||
          JSON.stringify([...replies.values()]).includes(secret) ||
          output.includes(secret)
      )
    )
    assert.equal(
      calls.some(call => ['fetch', 'push'].includes(call.method)),
      false
    )
    await assert.rejects(access(transfers), { code: 'ENOENT' })
    assert.equal(
      errors.length,
      0,
      errors.map(error => error.message).join('\n')
    )
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGINT')
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }, 6000)
      try {
        await once(server, 'exit')
      } finally {
        clearTimeout(timer)
      }
    }
    await Promise.all(
      sockets.map(socket => {
        if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
        return new Promise(resolve => {
          socket.once('close', resolve)
          socket.terminate()
        })
      })
    )
    dom?.window.close()
    await rm(temporary, { recursive: true, force: true })
  }
})
