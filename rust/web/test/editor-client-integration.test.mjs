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

const root = fileURLToPath(new URL('../../..', import.meta.url))
const binary = path.join(root, 'rust/target/debug/desktop-rs')
async function until(check, message) {
  const deadline = performance.now() + 12000
  while (performance.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(typeof message === 'function' ? message() : message)
}

test('full browser configures an editor, reviews/stages the edited conflict and continues a merge', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'desktop-editor-client-')
  )
  const repo = path.join(temporary, 'repository with spaces'),
    config = path.join(temporary, 'repositories.json'),
    filename = 'conflict file.txt',
    marker = path.join(temporary, 'editor ran.json')
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(temporary, 'global'),
  }
  const sockets = [],
    calls = [],
    errors = []
  let server, dom
  const git = (...args) => {
    const value = spawnSync('git', ['-C', repo, ...args], {
      env,
      encoding: 'utf8',
    })
    assert.equal(value.status, 0, value.stderr)
    return value.stdout
  }
  try {
    await mkdir(repo)
    git('init', '-qb', 'main')
    git('config', 'user.name', 'Editor Browser Test')
    git('config', 'user.email', 'editor@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    await writeFile(path.join(repo, filename), 'base\n')
    git('add', '--', filename)
    git('commit', '-qm', 'base')
    git('switch', '-qc', 'side')
    await writeFile(path.join(repo, filename), 'theirs\n')
    git('commit', '-qam', 'side')
    git('switch', '-q', 'main')
    await writeFile(path.join(repo, filename), 'ours\n')
    git('commit', '-qam', 'ours')
    assert.notEqual(
      spawnSync('git', ['-C', repo, 'merge', 'side'], { env }).status,
      0
    )
    const editor = path.join(temporary, 'editor app.py')
    await writeFile(
      editor,
      'import json,sys\nfrom pathlib import Path\nPath(sys.argv[1]).write_text("resolved in external editor\\n")\nPath(sys.argv[2]).write_text(json.dumps(sys.argv[1:]))\n'
    )
    const python = spawnSync(
      'python3',
      ['-c', 'import sys;print(sys.executable)'],
      { encoding: 'utf8' }
    ).stdout.trim()
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
      'editor fixture bridge did not start'
    )
    const url = /Open (http:\/\/[^\s]+)/.exec(output)[1]
    const html = await (await fetch(url.split('#')[0])).text()
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
    const document = dom.window.document
    const status = () => document.querySelector('#connection').textContent
    await until(
      () =>
        status() === 'Ready' && document.querySelector('#cancel-work').disabled,
      () => 'editor client did not settle: ' + status()
    )
    const settings = document.querySelector('.editor-settings')
    const button = (container, text) =>
      [...container.querySelectorAll('button')].find(
        item => item.textContent === text
      )
    async function clickReady(container, label) {
      await until(
        () => {
          const node = button(container, label)
          return node && !node.disabled
        },
        () => `Control was not ready: ${label}; ${container.textContent}`
      )
      button(container, label).click()
    }
    function input(element, text) {
      const prototype =
        element.tagName === 'TEXTAREA'
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(
        element,
        text
      )
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }
    settings.open = true
    const selection = settings.querySelector('[aria-label="Editor selection"]')
    selection.value = 'custom'
    selection.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    input(settings.querySelector('[aria-label="Editor executable"]'), python)
    input(
      settings.querySelector('[aria-label="Editor arguments"]'),
      [editor, '{path}', marker, '$(touch must-not-exist)'].join('\n')
    )
    button(settings, 'Save editor preference')
      .closest('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
    await until(
      () => settings.textContent.includes('Editor preference saved'),
      'editor preferences were not saved'
    )
    const saved = spawnSync(binary, ['--config', config, 'preferences'], {
      env,
      encoding: 'utf8',
    })
    assert.equal(saved.status, 0, saved.stderr)
    assert.deepEqual(JSON.parse(saved.stdout).external_editor, {
      kind: 'command',
      program: python,
      args: [editor, '{path}', marker, '$(touch must-not-exist)'],
      terminal: false,
    })
    const recovery = document.querySelector('#recovery-root')
    await until(
      () => button(recovery, 'Inspect conflict: ' + filename),
      'conflict did not appear'
    )
    await clickReady(recovery, 'Inspect conflict: ' + filename)
    await until(
      () =>
        button(recovery, 'Stage edited resolution') &&
        !button(recovery, 'Stage edited resolution').disabled,
      'conflict review did not load'
    )
    const index = git('ls-files', '--stage')
    await until(
      () => !button(recovery, 'Stage edited resolution').disabled,
      'edited resolution was not ready'
    )
    await clickReady(recovery, 'Stage edited resolution')
    await until(
      () => button(recovery, 'Stage with detected conflict markers'),
      'marker warning did not reach the client'
    )
    assert.equal(git('ls-files', '--stage'), index)
    await clickReady(recovery, 'Open external editor')
    await until(async () => {
      try {
        return (
          recovery.textContent.includes('Editor launched') &&
          JSON.parse(await readFile(marker, 'utf8'))[0] ===
            path.join(repo, filename)
        )
      } catch {
        return false
      }
    }, 'editor command did not receive the selected file')
    assert.equal(
      await readFile(path.join(repo, filename), 'utf8'),
      'resolved in external editor\n'
    )
    assert.equal(git('ls-files', '--stage'), index)
    await until(
      () => !button(recovery, 'Stage edited resolution').disabled,
      'edited resolution was not ready'
    )
    await clickReady(recovery, 'Stage edited resolution')
    await until(
      () => recovery.textContent.includes('Conflict or working file changed'),
      'edited file accepted an obsolete review'
    )
    assert(!button(recovery, 'Stage with detected conflict markers'))
    await clickReady(recovery, 'Refresh edited preview')
    await until(
      () => !button(recovery, 'Stage edited resolution').disabled,
      'edited review did not refresh'
    )
    assert(!button(recovery, 'Stage with detected conflict markers'))
    await until(
      () => !button(recovery, 'Stage edited resolution').disabled,
      'edited resolution was not ready'
    )
    await clickReady(recovery, 'Stage edited resolution')
    await until(
      () =>
        !git('ls-files', '-u') &&
        recovery.textContent.includes('Edited resolution staged'),
      'reviewed resolution did not stage'
    )
    assert.equal(git('show', ':' + filename), 'resolved in external editor\n')
    await until(
      () => button(recovery, 'Unstage resolution (keep working files)'),
      'staged resolution did not expose undo'
    )
    await writeFile(path.join(repo, filename), 'newer editor draft\n')
    await clickReady(recovery, 'Unstage resolution (keep working files)')
    await until(
      () =>
        recovery.textContent.includes('working edits kept') &&
        !!git('ls-files', '-u'),
      'resolution undo did not restore conflict stages'
    )
    assert.equal(
      await readFile(path.join(repo, filename), 'utf8'),
      'newer editor draft\n'
    )
    assert.equal(git('ls-files', '--stage'), index)
    await until(
      () => !button(recovery, 'Use theirs and stage').disabled,
      'side choice was not ready'
    )
    await clickReady(recovery, 'Use theirs and stage')
    await until(
      () =>
        button(recovery, 'Undo last resolution') &&
        !button(recovery, 'Undo last resolution').disabled,
      'side choice did not expose undo'
    )
    assert.equal(await readFile(path.join(repo, filename), 'utf8'), 'theirs\n')
    await clickReady(recovery, 'Undo last resolution')
    await until(
      () => recovery.textContent.includes('Original conflict restored'),
      'side choice undo did not complete'
    )
    assert.equal(
      await readFile(path.join(repo, filename), 'utf8'),
      'newer editor draft\n'
    )
    assert.equal(git('ls-files', '--stage'), index)
    await until(
      () => !button(recovery, 'Stage edited resolution').disabled,
      'edited resolution was not ready'
    )
    await clickReady(recovery, 'Stage edited resolution')
    await until(
      () =>
        !git('ls-files', '-u') &&
        recovery.textContent.includes('Edited resolution staged'),
      'second edited resolution did not stage'
    )

    await until(
      () =>
        button(recovery, 'Continue operation') &&
        !button(recovery, 'Continue operation').disabled,
      'resolved merge could not continue'
    )
    await clickReady(recovery, 'Continue operation')
    await until(
      () => git('log', '-1', '--format=%P').trim().split(' ').length === 2,
      'merge continuation did not create its commit'
    )
    assert(calls.some(call => call.method === 'open_editor'))
    assert(calls.filter(call => call.method === 'stage_conflict').length >= 3)
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
