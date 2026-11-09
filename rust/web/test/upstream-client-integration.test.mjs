import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import WebSocket from 'ws'

const root = fileURLToPath(new URL('../../..', import.meta.url)),
  binary = path.join(root, 'rust/target/debug/desktop-rs'),
  parentURL = 'https://github.example/parent/repo.git',
  wrongURL = 'https://github.example/different/repo.git'
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

test('production localhost client reviews missing parent upstream, adds it without transfers and preserves matching/conflicting configuration', async () => {
  const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'desktop-upstream-client-')
    ),
    repo = path.join(temporary, 'repository with spaces'),
    config = path.join(temporary, 'repositories.json'),
    tools = path.join(temporary, 'bin'),
    gitLog = path.join(temporary, 'app-git.jsonl'),
    metadataFile = path.join(temporary, 'metadata.json')
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
  assert(realGit, 'native Git is required')
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(temporary, 'global'),
    GIT_OPTIONAL_LOCKS: '0',
    GH_CONFIG_DIR: path.join(temporary, 'gh-config'),
    UPSTREAM_CLIENT_GIT_LOG: gitLog,
    UPSTREAM_CLIENT_METADATA: metadataFile,
    PATH: [tools, process.env.PATH].join(path.delimiter),
  }
  for (const key of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN',
  ])
    delete env[key]
  const calls = [],
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
  function upstreamPresent() {
    return (
      spawnSync(
        realGit,
        ['-C', repo, 'config', '--get', 'remote.upstream.url'],
        { env }
      ).status === 0
    )
  }
  async function state() {
    return {
      refs: git(
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(symref)'
      ),
      head: git('symbolic-ref', '--quiet', 'HEAD'),
      index: await readFile(path.join(repo, '.git/index')),
      working: await readFile(path.join(repo, 'file.txt')),
      loose: await readFile(path.join(repo, 'untracked.bin')),
    }
  }
  try {
    await mkdir(repo)
    await mkdir(tools)
    await writeFile(
      metadataFile,
      JSON.stringify({
        nameWithOwner: 'fork/repo',
        url: 'https://github.example/fork/repo',
        isFork: true,
        parent: {
          nameWithOwner: 'parent/repo',
          url: 'https://github.example/parent/repo',
        },
      }),
      { mode: 0o600 }
    )
    await writeFile(
      path.join(tools, 'gh'),
      `#!${python}\nimport os,sys\nfrom pathlib import Path\na=sys.argv[1:]\nif a[:2]==['repo','view']:\n sys.stdout.write(Path(os.environ['UPSTREAM_CLIENT_METADATA']).read_text());sys.exit(0)\nprint('{"hosts":{}}');sys.exit(4)\n`,
      { mode: 0o700 }
    )
    await writeFile(
      path.join(tools, 'git'),
      `#!${python}\nimport json,os,sys\na=sys.argv[1:]\ni=0\nwhile i<len(a):\n if a[i] in ['-c','-C','--git-dir','--work-tree','--namespace']:i+=2\n elif a[i] in ['--no-pager','--paginate','--literal-pathspecs','--no-optional-locks'] or a[i].startswith(('--git-dir=','--work-tree=')):i+=1\n else:break\ncmd=a[i:]\nforbidden=bool(cmd) and (cmd[0] in ['fetch','push','pull','clone'] or (cmd[0]=='ls-remote' and '--get-url' not in cmd) or (cmd[0]=='remote' and any(flag in cmd for flag in ['update','prune','--fetch','-f'])))\nwith open(os.environ['UPSTREAM_CLIENT_GIT_LOG'],'a') as log:log.write(json.dumps({'command':cmd,'forbidden':forbidden})+'\\n')\nif forbidden:\n sys.stderr.write('Git transfer forbidden by offline upstream browser fixture\\n');sys.exit(97)\nreal=${JSON.stringify(
        realGit
      )}\nos.execv(real,[real,*a])\n`,
      { mode: 0o700 }
    )
    git('init', '-qb', 'main')
    git('config', 'user.name', 'Upstream Browser Test')
    git('config', 'user.email', 'upstream-browser@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    await writeFile(path.join(repo, 'file.txt'), 'base\n')
    git('add', '--', 'file.txt')
    git('commit', '-qm', 'base')
    git('remote', 'add', 'origin', 'https://github.example/fork/repo.git')
    git(
      'update-ref',
      'refs/remotes/origin/main',
      git('rev-parse', 'HEAD').trim()
    )
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
    await writeFile(path.join(repo, 'file.txt'), 'staged bytes\n')
    git('add', '--', 'file.txt')
    await writeFile(path.join(repo, 'file.txt'), 'working bytes\n')
    await writeFile(path.join(repo, 'untracked.bin'), Buffer.from([0, 255, 10]))
    const original = await state()
    const seed = spawnSync(
      binary,
      ['-C', repo, 'repository-context', '--refresh'],
      { env, encoding: 'utf8' }
    )
    assert.equal(seed.status, 0, seed.stderr)
    assert.equal(JSON.parse(seed.stdout).status, 'verified')
    assert.equal(
      git('config', '--get-all', 'remote.upstream.url'),
      parentURL + '\n'
    )
    assert.deepEqual(await state(), original)
    git('remote', 'remove', 'upstream')
    const before = await state(),
      configFile = path.join(repo, '.git/config'),
      beforeConfig = await readFile(configFile)
    assert.equal(upstreamPresent(), false)
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
      'upstream fixture bridge did not start'
    )
    const url = /Open (http:\/\/[^\s]+)/.exec(output)[1],
      html = await (await fetch(url.split('#')[0])).text()
    const bundled = await build({
      entryPoints: [path.join(root, 'rust/web/client.js')],
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
        document.querySelector('.repository-context'),
      'upstream client did not initialize'
    )
    const contribution = document.querySelector('.repository-context')
    contribution.open = true
    async function click(label) {
      await until(
        () =>
          button(contribution, label) && !button(contribution, label).disabled,
        () =>
          'upstream control not ready: ' +
          label +
          '; ' +
          contribution.textContent
      )
      button(contribution, label).click()
    }
    await click('Load contribution settings')
    await until(
      () =>
        button(contribution, 'Review parent upstream setup') &&
        !button(contribution, 'Review parent upstream setup').disabled,
      () => 'verified fork did not load: ' + contribution.textContent
    )
    assert.equal(contribution.querySelector('select').value, 'parent')
    await click('Review parent upstream setup')
    await until(
      () =>
        button(contribution, 'Confirm parent upstream setup') &&
        !button(contribution, 'Confirm parent upstream setup').disabled,
      () => 'upstream review did not load: ' + contribution.textContent
    )
    assert(contribution.textContent.includes(parentURL))
    assert.equal(upstreamPresent(), false)
    assert.deepEqual(await readFile(configFile), beforeConfig)
    assert.deepEqual(await state(), before)
    assert.equal(
      calls.filter(call => call.method === 'setup_upstream').length,
      0
    )
    await click('Confirm parent upstream setup')
    await until(
      () =>
        contribution.textContent.includes('Parent upstream configured.') &&
        !button(contribution, 'Load contribution settings').disabled,
      () => 'reviewed upstream setup failed: ' + contribution.textContent
    )
    const setup = calls.find(call => call.method === 'setup_upstream')
    assert.deepEqual(Object.keys(setup).sort(), [
      'basis',
      'id',
      'method',
      'repository_id',
    ])
    assert.equal(typeof setup.basis, 'string')
    assert.equal(typeof setup.repository_id, 'string')
    assert.equal(
      git('config', '--get-all', 'remote.upstream.url'),
      parentURL + '\n'
    )
    assert.equal(
      git('config', '--get-all', 'remote.upstream.fetch'),
      '+refs/heads/*:refs/remotes/upstream/*\n'
    )
    assert.deepEqual(await state(), before)
    const configured = await readFile(configFile)
    await click('Review parent upstream setup')
    await until(
      () =>
        contribution.textContent.includes(
          'Upstream is already configured for the parent repository.'
        ) && !button(contribution, 'Review parent upstream setup').disabled,
      () =>
        'matching upstream did not produce a no-op review: ' +
        contribution.textContent
    )
    assert.equal(
      button(contribution, 'Confirm parent upstream setup'),
      undefined
    )
    assert.deepEqual(await readFile(configFile), configured)
    assert.equal(
      calls.filter(call => call.method === 'setup_upstream').length,
      1
    )
    git('config', 'remote.upstream.url', wrongURL)
    const conflicting = await readFile(configFile)
    await click('Review parent upstream setup')
    await until(
      () =>
        contribution.textContent.includes(
          'Parent upstream setup is blocked.'
        ) && !button(contribution, 'Review parent upstream setup').disabled,
      () => 'conflicting upstream was not blocked: ' + contribution.textContent
    )
    assert.equal(
      button(contribution, 'Confirm parent upstream setup'),
      undefined
    )
    assert.equal(
      git('config', '--get-all', 'remote.upstream.url'),
      wrongURL + '\n'
    )
    assert.deepEqual(await readFile(configFile), conflicting)
    assert.deepEqual(await state(), before)
    assert.equal(
      calls.filter(call => call.method === 'setup_upstream').length,
      1
    )
    assert.equal(
      calls.some(call =>
        ['fetch', 'push', 'refresh_repository_context'].includes(call.method)
      ),
      false
    )
    const gitCalls = (await readFile(gitLog, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    assert.equal(
      gitCalls.some(call => call.forbidden),
      false,
      'upstream workflow attempted a Git transfer'
    )
    assert.equal(
      gitCalls.filter(
        call =>
          call.command[0] === 'remote' &&
          call.command[1] === 'add' &&
          call.command.includes('upstream')
      ).length,
      2
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
