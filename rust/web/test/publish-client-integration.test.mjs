import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import WebSocket from 'ws'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const binary = path.join(root, 'rust/target/debug/desktop-rs')
const token = 'synthetic-publish-fixture-token-298'
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
    node => node.textContent === label
  )
}

test('served localhost client reviews verified continuation and acknowledges history over WebSocket', async () => {
  const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'desktop-publish-client-')
    ),
    repo = path.join(temporary, 'my repository'),
    config = path.join(temporary, 'registry.json'),
    tools = path.join(temporary, 'bin'),
    log = path.join(temporary, 'gh-log'),
    gitLog = path.join(temporary, 'git-log'),
    providerFile = path.join(temporary, 'provider.json')
  const programs = spawnSync(
    'python3',
    [
      '-c',
      'import json,shutil,sys;print(json.dumps([sys.executable,shutil.which("git")]))',
    ],
    { encoding: 'utf8' }
  )
  assert.equal(programs.status, 0, programs.stderr)
  const [python, realGit] = JSON.parse(programs.stdout)
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(temporary, 'global'),
    GIT_OPTIONAL_LOCKS: '0',
    GH_CONFIG_DIR: path.join(temporary, 'gh-config'),
    PUBLISH_CLIENT_LOG: log,
    PUBLISH_CLIENT_GIT_LOG: gitLog,
    PUBLISH_CLIENT_PROVIDER: providerFile,
    PATH: [tools, process.env.PATH].join(path.delimiter),
  }
  for (const name of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN',
    'GH_REPO',
    'GH_HOST',
    'GH_DEBUG',
    'DEBUG',
  ])
    delete env[name]
  const sockets = [],
    calls = [],
    replies = [],
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
  async function snapshot() {
    return {
      config: await readFile(path.join(repo, '.git/config')),
      head: await readFile(path.join(repo, '.git/HEAD')),
      index: await readFile(path.join(repo, '.git/index')),
      file: await readFile(path.join(repo, 'file.txt')),
      refs: git('for-each-ref', '--format=%(refname) %(objectname)'),
      registry: await readFile(config),
    }
  }
  try {
    await mkdir(repo)
    await mkdir(tools)
    await writeFile(
      path.join(tools, 'gh'),
      `#!${python}
import json,os,sys
args=sys.argv[1:]
with open(os.environ['PUBLISH_CLIENT_LOG'],'a') as log: log.write(json.dumps(args)+'\\n')
if args[:2]==['auth','status']:
 print(json.dumps({'hosts':{'github.com':[{'host':'github.com','login':'Alice','active':True,'state':'success','tokenSource':'keyring','gitProtocol':'https'}]}}));sys.exit(0)
if args[:2]==['auth','token']:
 print(${JSON.stringify(token)});sys.exit(0)
if args[:1]==['api']:
 if any(os.environ.get(k)!=${JSON.stringify(
   token
 )} for k in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']):sys.exit(92)
 if '--method' not in args:sys.exit(91)
 method=args[args.index('--method')+1]
 from pathlib import Path
 provider=json.loads(Path(os.environ['PUBLISH_CLIENT_PROVIDER']).read_text())
 if method=='POST':
  if not provider['allow_post'] or args[-3:]!=['/user/repos','--input','-']:sys.exit(91)
  body=json.load(sys.stdin)
  if body!={'name':'my-repository','description':'','private':True}:sys.exit(94)
  print(json.dumps(provider['repository']));sys.exit(0)
 if method!='GET':sys.exit(91)
 endpoint=args[-1]
 if endpoint=='/user':print(json.dumps({'login':'alice','id':101}));sys.exit(0)
 if endpoint.startswith('/user/orgs?'):print(json.dumps([{'login':'ExampleOrg','id':987}]));sys.exit(0)
 if endpoint=='/repos/alice/my-repository':print(json.dumps(provider['repository']));sys.exit(0)
sys.exit(93)
`,
      { mode: 0o700 }
    )
    await writeFile(
      path.join(tools, 'git'),
      `#!${python}
import json,os,sys
args=sys.argv[1:];i=0
while i<len(args):
 if args[i] in ['-c','-C','--git-dir','--work-tree','--namespace']:i+=2
 elif args[i] in ['--no-pager','--paginate','--literal-pathspecs','--no-optional-locks'] or args[i].startswith(('--git-dir=','--work-tree=')):i+=1
 else:break
cmd=args[i:]
forbidden=bool(cmd) and (cmd[0] in ['fetch','push','pull','clone'] or (cmd[0]=='ls-remote' and '--get-url' not in cmd) or (cmd[0]=='remote' and any(flag in cmd for flag in ['update','prune','--fetch','-f'])))
with open(os.environ['PUBLISH_CLIENT_GIT_LOG'],'a') as log:log.write(json.dumps({'command':cmd,'forbidden':forbidden})+'\\n')
if forbidden:sys.exit(97)
real=${JSON.stringify(realGit)}
os.execv(real,[real,*args])
`,
      { mode: 0o700 }
    )
    git('init', '-qb', 'main')
    git('config', 'user.name', 'Fixture')
    git('config', 'user.email', 'fixture@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    await writeFile(path.join(repo, 'file.txt'), 'fixture data\n')
    git('add', '--', 'file.txt')
    git('commit', '-qm', 'fixture')
    const seed = spawnSync(
      binary,
      ['--config', config, 'repositories', 'add', repo, '--select'],
      { env, encoding: 'utf8' }
    )
    assert.equal(seed.status, 0, seed.stderr)
    const providerRepository = {
      id: 8001,
      name: 'my-repository',
      full_name: 'alice/my-repository',
      owner: { login: 'alice', id: 101 },
      html_url: 'https://github.com/alice/my-repository',
      clone_url: 'https://github.com/alice/my-repository.git',
      private: true,
      fork: false,
      parent: null,
    }
    const provider = async (allowPost, repository = providerRepository) =>
      writeFile(
        providerFile,
        JSON.stringify({ allow_post: allowPost, repository }),
        { mode: 0o600 }
      )
    await provider(true)
    const proposal = [
      '--effective',
      '--owner',
      'alice',
      '--name',
      'my-repository',
    ]
    const readPreview = spawnSync(
      binary,
      ['-C', repo, '--config', config, 'publish', 'preview', ...proposal],
      { env, encoding: 'utf8' }
    )
    assert.equal(readPreview.status, 0, readPreview.stderr)
    const create = spawnSync(
      binary,
      [
        '-C',
        repo,
        '--config',
        config,
        'publish',
        'create',
        ...proposal,
        '--basis',
        JSON.parse(readPreview.stdout).basis,
        '--acknowledge-partial',
      ],
      { env, encoding: 'utf8' }
    )
    assert.equal(create.status, 0, create.stderr)
    const created = JSON.parse(create.stdout)
    assert.equal(created.phase, 'created')
    const createdId = created.receipt_id
    assert.equal(typeof createdId, 'string')
    // All later requests must be GET; the setup POST was handled entirely by the fake gh executable.
    await provider(false)
    await writeFile(log, '', { mode: 0o600 })
    const hash = value => createHash('sha256').update(value).digest('hex'),
      namespace = hash(config),
      repositoryId = hash(repo),
      record = JSON.parse(await readFile(config, 'utf8')).records.find(
        row => row.path === repo
      ),
      receiptId = randomUUID(),
      receiptDirectory = path.join(
        repo,
        '.git',
        'desktop-publish-receipts',
        hash(JSON.stringify([namespace, record.id]))
      ),
      receiptPath = path.join(receiptDirectory, receiptId + '.json')
    await mkdir(receiptDirectory, { recursive: true, mode: 0o700 })
    await writeFile(
      receiptPath,
      JSON.stringify({
        version: 1,
        id: receiptId,
        repository_id: repositoryId,
        namespace,
        record_id: record.id,
        phase: 'creation_unknown',
        host: 'github.com',
        owner: 'alice',
        name: 'my-repository',
        error: 'network',
        acknowledged: false,
      }),
      { mode: 0o600 }
    )
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
      () => 'bridge did not start: ' + output
    )
    const url = /Open (http:\/\/[^\s]+)/.exec(output)[1],
      base = url.split('#')[0]
    const html = await (await fetch(base)).text()
    // Bundle exactly the modules embedded in the running server, not workspace copies.
    const served = path.join(temporary, 'served')
    await mkdir(served)
    for (const file of ['client.js', 'transport.js', 'panels.js']) {
      const response = await fetch(new URL(file, base))
      assert.equal(response.status, 200, file)
      await writeFile(path.join(served, file), await response.text())
    }
    const bundled = await build({
      entryPoints: [path.join(served, 'client.js')],
      bundle: true,
      write: false,
      format: 'iife',
      logLevel: 'silent',
    })
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', error => errors.push(error))
    class BrowserSocket extends WebSocket {
      constructor(address) {
        super(address, {
          origin: new URL(address).origin.replace('ws:', 'http:'),
        })
        sockets.push(this)
        this.on('message', data => replies.push(JSON.parse(data.toString())))
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
        document.querySelector('.publish-repository'),
      'publication view did not initialize'
    )
    const view = document.querySelector('.publish-repository')
    view.open = true
    await until(
      () =>
        button(view, 'Load publishing options') &&
        !button(view, 'Load publishing options').disabled,
      () => view.textContent
    )
    const before = await snapshot()
    button(view, 'Load publishing options').click()
    await until(
      () =>
        button(view, 'Review publication') &&
        !button(view, 'Review publication').disabled,
      () => 'options unavailable: ' + view.textContent
    )
    button(view, 'Review publication').click()
    await until(
      () => view.querySelector('[aria-label="Publication review"]'),
      () => 'preview unavailable: ' + view.textContent
    )
    assert(view.textContent.includes('Full publication is not available'))
    assert(view.textContent.includes('alice/my-repository'))
    assert(view.textContent.includes('main'))
    assert(!button(view, 'Publish repository'))
    assert(button(view, 'Load publication history'))
    const preview = calls.find(call => call.method === 'publish_preview')
    assert.deepEqual(preview.request, {
      host: 'github.com',
      target: { mode: 'effective' },
      owner: 'alice',
      name: 'my-repository',
      description: '',
      private: true,
    })
    assert(
      !calls.some(call =>
        ['publish', 'publish_history', 'acknowledge_publish'].includes(
          call.method
        )
      )
    )
    assert.deepEqual(await snapshot(), before)
    button(view, 'Load publication history').click()
    await until(
      () => button(view, 'Acknowledge ' + receiptId),
      () => 'history unavailable: ' + view.textContent
    )
    assert(view.textContent.includes('Inspect GitHub before acknowledging'))
    assert(view.textContent.includes('Repository URL is unavailable'))
    assert(!button(view, 'Review continuation ' + receiptId))
    await until(
      () => button(view, 'Review continuation ' + createdId),
      () => 'created receipt missing: ' + view.textContent
    )
    button(view, 'Review continuation ' + createdId).click()
    await until(
      () => view.querySelector('[aria-label="Continuation review"]'),
      () => 'continuation unavailable: ' + view.textContent
    )
    const continuation = view.querySelector(
      '[aria-label="Continuation review"]'
    )
    assert.equal(
      continuation.querySelector('a').href,
      'https://github.com/alice/my-repository'
    )
    assert(continuation.textContent.includes('Verified account: alice'))
    assert(continuation.textContent.includes('not executed by this review'))
    assert.deepEqual(
      calls.find(call => call.method === 'publish_continue_preview').receipt_id,
      createdId
    )
    assert(
      !calls.some(call =>
        ['publish_create', 'publish_continue', 'publish'].includes(call.method)
      )
    )
    assert.deepEqual(await snapshot(), before)
    await provider(false, {
      ...providerRepository,
      html_url: 'https://evil.invalid/alice/my-repository',
    })
    button(view, 'Review continuation ' + createdId).click()
    await until(
      () => view.textContent.includes('Could not verify the continuation'),
      () => 'unsafe URL was not rejected: ' + view.textContent
    )
    assert(!view.querySelector('[aria-label="Continuation review"]'))
    assert(!view.textContent.includes('evil.invalid'))
    assert.deepEqual(await snapshot(), before)
    assert.equal(
      calls.filter(call => call.method === 'publish_continue_preview').length,
      2
    )
    assert.equal(
      JSON.parse(await readFile(receiptPath, 'utf8')).acknowledged,
      false
    )
    button(view, 'Acknowledge ' + receiptId).click()
    await until(
      () => view.textContent.includes('Receipt acknowledged.'),
      () => 'acknowledgement unavailable: ' + view.textContent
    )
    assert.equal(
      JSON.parse(await readFile(receiptPath, 'utf8')).acknowledged,
      true
    )
    assert.equal(
      calls.filter(call => call.method === 'acknowledge_publish').length,
      1
    )
    assert.deepEqual(
      calls.find(call => call.method === 'acknowledge_publish').receipt_id,
      receiptId
    )
    assert(!calls.some(call => call.method === 'publish'))
    assert.deepEqual(await snapshot(), before)
    await provider(false)
    button(view, 'Review continuation ' + createdId).click()
    await until(
      () =>
        view.querySelector('[aria-label="Continuation review"]') &&
        button(view, 'Add origin and assign account'),
      () => 'reviewed origin step unavailable: ' + view.textContent
    )
    const consent = [...view.querySelectorAll('label')]
      .find(label =>
        label.textContent.includes('I understand this adds origin')
      )
      ?.querySelector('input')
    assert(consent)
    assert(button(view, 'Add origin and assign account').disabled)
    assert(!calls.some(call => call.method === 'publish_continue'))
    consent.click()
    assert(!button(view, 'Add origin and assign account').disabled)
    const lastReview = calls
      .filter(call => call.method === 'publish_continue_preview')
      .at(-1)
    const basis = replies.find(reply => reply.id === lastReview.id)?.result
      ?.basis
    assert.equal(typeof basis, 'string')
    button(view, 'Add origin and assign account').click()
    await until(
      () => view.textContent.includes('No branches were pushed.'),
      () => 'origin step failed: ' + view.textContent
    )
    const applied = calls.filter(call => call.method === 'publish_continue')
    assert.equal(applied.length, 1)
    assert.equal(applied[0].receipt_id, createdId)
    assert.equal(applied[0].basis, basis)
    assert.equal(applied[0].acknowledge_partial, true)
    assert.equal(
      git('config', '--get', 'remote.origin.url').trim(),
      'https://github.com/alice/my-repository.git'
    )
    const after = await snapshot()
    for (const key of ['head', 'index', 'file', 'refs'])
      assert.deepEqual(after[key], before[key])
    const recordAfter = JSON.parse(after.registry).records.find(
      row => row.path === repo
    )
    assert.equal(recordAfter.account.assignment.mode, 'effective')
    assert(view.textContent.includes('Phase: account_assigned'))
    assert(
      !calls.some(call =>
        ['publish_create', 'push', 'publish'].includes(call.method)
      )
    )
    const ghCalls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    assert(
      ghCalls.some(
        args => args[0] === 'api' && args.at(-1).startsWith('/user/orgs?')
      )
    )
    assert(
      ghCalls.some(
        args =>
          args[0] === 'api' && args.at(-1) === '/repos/alice/my-repository'
      )
    )
    assert(
      ghCalls.every(
        args =>
          !['POST', 'PUT', 'PATCH', 'DELETE'].some(method =>
            args.includes(method)
          )
      )
    )
    const gitCalls = (await readFile(gitLog, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    assert(!gitCalls.some(entry => entry.forbidden))
    assert(
      !JSON.stringify({
        calls,
        replies,
        html,
        output,
        text: view.textContent,
      }).includes(token)
    )
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
