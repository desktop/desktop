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
  binary = path.join(root, 'rust/target/debug/desktop-rs')
async function until(check, message) {
  const deadline = performance.now() + 15000
  while (performance.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(typeof message === 'function' ? message() : message)
}
function button(container, text) {
  return [...container.querySelectorAll('button')].find(
    button => button.textContent === text
  )
}
function input(container, label) {
  return [...container.querySelectorAll('label')]
    .find(item => item.textContent.includes(label))
    .querySelector('input')
}

test('localhost browser saves/inspects/moves stashes, refuses stale removal and retains conflicted pops', async () => {
  const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'desktop-stash-client-')
    ),
    repo = path.join(temporary, 'repository with spaces'),
    config = path.join(temporary, 'registry.json')
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(temporary, 'global'),
    PATH: [
      ...(process.env.GIT_LFS_BIN
        ? [path.dirname(process.env.GIT_LFS_BIN)]
        : []),
      process.env.PATH,
    ].join(path.delimiter),
  }
  const sockets = [],
    calls = [],
    errors = []
  let server, dom
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], {
      env,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  try {
    await mkdir(repo)
    git('init', '-qb', 'main')
    git('config', 'user.name', 'Stash Browser')
    git('config', 'user.email', 'stash-browser@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    await writeFile(path.join(repo, 'file.txt'), 'base\n')
    git('add', '--', 'file.txt')
    git('commit', '-qm', 'base')
    await writeFile(path.join(repo, 'file.txt'), 'saved staged\n')
    git('add', '--', 'file.txt')
    await writeFile(
      path.join(repo, 'file.txt'),
      'saved staged\nsaved working\n'
    )
    await writeFile(path.join(repo, 'untracked.txt'), 'saved untracked\n')
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
      'stash bridge did not start'
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
    const console = new VirtualConsole()
    console.on('jsdomError', error => errors.push(error))
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
      virtualConsole: console,
    })
    dom.window.TextEncoder = globalThis.TextEncoder
    dom.window.WebSocket = BrowserSocket
    dom.window.eval(bundled.outputFiles[0].text)
    const document = dom.window.document,
      stash =
        document.querySelector('.stash-panel') ||
        document.querySelector('#stash-root'),
      diff = document.querySelector('#diff-root'),
      recovery = document.querySelector('#recovery-root')
    await until(
      () =>
        button(stash, 'Save stash') && !button(stash, 'Save stash').disabled,
      'stash controls not ready'
    )
    stash.querySelector('details').open = true
    button(stash, 'Save stash').click()
    await until(
      () => stash.textContent.includes('Local changes saved'),
      'stash was not saved'
    )
    assert.equal(git('status', '--porcelain'), '')
    assert.equal(git('stash', 'list').trim().split('\n').length, 1)
    const initialHead = git('rev-parse', 'HEAD'),
      initialIndex = git('ls-files', '--stage')
    const inspect = async index => {
      await until(
        () =>
          button(stash, `Inspect stash@{${index}}`) &&
          !button(stash, `Inspect stash@{${index}}`).disabled,
        () => 'stash list not ready: ' + stash.textContent
      )
      button(stash, `Inspect stash@{${index}}`).click()
      await until(
        () =>
          button(stash, 'Apply (keep stash)') &&
          !button(stash, 'Apply (keep stash)').disabled,
        () => 'stash inspection not ready: ' + stash.textContent
      )
    }
    await inspect(0)
    button(stash, 'M file.txt').click()
    await until(
      () => diff.textContent.includes('saved working'),
      'saved working diff did not load'
    )
    button(stash, 'Saved staged files').click()
    button(stash, 'M file.txt').click()
    await until(
      () =>
        diff.textContent.includes('saved staged') &&
        !diff.textContent.includes('saved working'),
      'saved index diff did not load'
    )
    assert.equal(git('rev-parse', 'HEAD'), initialHead)
    assert.equal(git('ls-files', '--stage'), initialIndex)
    await until(
      () =>
        !input(stash, 'Restore the saved index').disabled &&
        !button(stash, 'Apply (keep stash)').disabled,
      'stash apply was not ready'
    )
    input(stash, 'Restore the saved index').click()
    button(stash, 'Apply (keep stash)').click()
    await until(
      () => stash.textContent.includes('Stash applied; saved entry kept'),
      'stash apply did not complete'
    )
    assert.equal(
      await readFile(path.join(repo, 'file.txt'), 'utf8'),
      'saved staged\nsaved working\n'
    )
    assert.equal(git('show', ':file.txt'), 'saved staged\n')
    assert.equal(
      await readFile(path.join(repo, 'untracked.txt'), 'utf8'),
      'saved untracked\n'
    )
    git('reset', '--hard', '-q')
    await rm(path.join(repo, 'untracked.txt'))
    await inspect(0)
    const branchInput = input(stash, 'Associate stash with branch')
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value'
    ).set.call(branchInput, 'feature/kept')
    branchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    button(stash, 'Move stash to branch').click()
    await until(
      () => stash.textContent.includes('Stash moved to branch'),
      'stash reassociation did not complete'
    )
    assert(git('stash', 'list').includes('!!GitHub_Desktop<feature/kept>'))
    await inspect(0)
    await writeFile(path.join(repo, 'file.txt'), 'external stash\n')
    git('stash', 'push', '-qm', 'external')
    button(stash, 'Remove stash…').click()
    button(stash, 'Remove saved stash entry').click()
    await until(
      () => stash.textContent.includes('Stashes changed'),
      'stale removal was not rejected'
    )
    assert.equal(git('stash', 'list').trim().split('\n').length, 2)
    await inspect(1)
    button(stash, 'Pop stash…').click()
    button(stash, 'Apply and pop stash').click()
    await until(
      () => stash.textContent.includes('Stash applied and removed'),
      'pinned older stash was not popped'
    )
    assert.equal(
      await readFile(path.join(repo, 'file.txt'), 'utf8'),
      'saved staged\nsaved working\n'
    )
    assert.equal(git('show', ':file.txt'), 'saved staged\n')
    assert(git('stash', 'list').includes('external'))
    assert(!git('stash', 'list').includes('feature/kept'))
    git('reset', '--hard', '-q')
    await rm(path.join(repo, 'untracked.txt'))
    await writeFile(
      path.join(repo, 'file.txt'),
      'committed divergent content\n'
    )
    git('commit', '-qam', 'divergent')
    await inspect(0)
    button(stash, 'Pop stash…').click()
    button(stash, 'Apply and pop stash').click()
    await until(
      () => recovery.textContent.includes('Inspect conflict: file.txt'),
      'stash conflict recovery did not appear'
    )
    assert(git('ls-files', '-u'))
    assert(git('stash', 'list').includes('external'))
    await until(
      () => !button(recovery, 'Inspect conflict: file.txt').disabled,
      'conflict inspection was not ready'
    )
    button(recovery, 'Inspect conflict: file.txt').click()
    await until(
      () =>
        button(recovery, 'Use ours and stage') &&
        !button(recovery, 'Use ours and stage').disabled,
      'conflict versions did not load'
    )
    button(recovery, 'Use ours and stage').click()
    await until(
      () => recovery.textContent.includes('Resolution staged'),
      'conflict could not be resolved'
    )
    assert.equal(git('ls-files', '-u'), '')
    assert.equal(
      await readFile(path.join(repo, 'file.txt'), 'utf8'),
      'committed divergent content\n'
    )
    await inspect(0)
    button(stash, 'Remove stash…').click()
    button(stash, 'Remove saved stash entry').click()
    await until(
      () => stash.textContent.includes('Stash entry removed'),
      'resolved retained stash could not be removed'
    )
    assert.equal(git('stash', 'list'), '')
    assert.equal(
      errors.length,
      0,
      errors.map(error => error.message).join('\n')
    )
    assert(calls.some(call => call.method === 'stash_files'))
    assert(
      calls
        .filter(call => call.method === 'stash_apply')
        .every(
          call => typeof call.oid === 'string' && typeof call.basis === 'string'
        )
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
      sockets.map(socket =>
        socket.readyState === WebSocket.CLOSED
          ? Promise.resolve()
          : new Promise(resolve => {
              socket.once('close', resolve)
              socket.terminate()
            })
      )
    )
    dom?.window.close()
    await rm(temporary, { recursive: true, force: true })
  }
})
