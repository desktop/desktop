import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import {
  mkdtemp,
  open as openFile,
  writeFile,
  readFile,
  mkdir,
  rm,
  access,
  stat,
  realpath,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import WebSocket from 'ws'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const binary = path.join(root, 'rust/target/debug/desktop-rs')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
// Two real RGBA pixels, with PNG chunks/checksums and a distinct changed image.
function imageFixture(pixels) {
  function chunk(name, contents) {
    const type = Buffer.from(name),
      length = Buffer.alloc(4),
      checksum = Buffer.alloc(4)
    length.writeUInt32BE(contents.length)
    checksum.writeUInt32BE(crc32(Buffer.concat([type, contents])))
    return Buffer.concat([length, type, contents, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(2, 0)
  header.writeUInt32BE(1, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, ...pixels]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
async function until(check, label, timeout = 12000) {
  const deadline = performance.now() + timeout
  while (performance.now() < deadline) {
    if (await check()) return
    await wait(25)
  }
  throw new Error(typeof label === 'function' ? label() : label)
}

test('complete web client cancels work, reconnects, refreshes preferences, and never replays commits', async () => {
  await access(binary)
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'desktop-client-'))
  const repo = path.join(temporary, 'repo')
  const config = path.join(temporary, 'repositories.json')
  const marker = path.join(temporary, 'hook-started')
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(temporary, 'global'),
    CLIENT_HOOK_MARKER: marker,
    PATH: [
      path.join(temporary, 'bin'),
      ...(process.env.GIT_LFS_BIN
        ? [path.dirname(process.env.GIT_LFS_BIN)]
        : []),
      process.env.PATH,
    ].join(path.delimiter),
  }
  function git(...args) {
    const result = spawnSync('git', ['-C', repo, ...args], {
      env,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  let server
  let dom
  const sockets = []
  const sent = []
  try {
    await mkdir(repo)
    git('init', '-q')
    git('config', 'user.name', 'Browser Test')
    git('config', 'user.email', 'browser@example.invalid')
    const hasLfs = spawnSync('git', ['lfs', 'version'], { env }).status === 0
    assert(
      !process.env.GIT_LFS_BIN || hasLfs,
      'GIT_LFS_BIN must resolve to working Git LFS tooling'
    )
    const lfsName = 'data.lfs',
      lfsBase = 'alpha\nbeta\n',
      lfsEdited = 'alpha\nBETA\n'
    const lfsRemote = path.join(temporary, 'lfs remote.git')
    if (hasLfs) {
      const remoteInit = spawnSync('git', ['init', '--bare', '-q', lfsRemote], {
        env,
        encoding: 'utf8',
      })
      assert.equal(remoteInit.status, 0, remoteInit.stderr)
      git('remote', 'add', 'origin', lfsRemote)
      git('lfs', 'install', '--local')
      git('lfs', 'track', '*.lfs')
      await writeFile(path.join(repo, lfsName), lfsBase)
      git('add', '--', '.gitattributes', lfsName)
    }

    const imageBefore = imageFixture([255, 0, 0, 255, 0, 0, 255, 255])
    const imageAfter = imageFixture([0, 0, 255, 255, 255, 0, 0, 255])
    await writeFile(path.join(repo, 'comparison.png'), imageBefore)
    git('add', '--', 'comparison.png')
    await writeFile(path.join(repo, 'file.txt'), 'initial\n')
    git('add', '--', 'file.txt')
    git('commit', '-qm', 'initial')
    const original = git('rev-parse', 'HEAD').trim()
    await writeFile(path.join(repo, 'comparison.png'), imageAfter)
    if (hasLfs) {
      await writeFile(path.join(repo, lfsName), lfsEdited)
      await writeFile(
        path.join(repo, '.git/hooks/pre-push'),
        '#!/bin/sh\n# custom-browser-hook-secret\nexit 0\n',
        { mode: 0o755 }
      )
    }
    await writeFile(path.join(repo, 'file.txt'), 'staged\n')
    git('add', '--', 'file.txt')
    const python = spawnSync(
      'python3',
      ['-c', 'import sys;print(sys.executable)'],
      { encoding: 'utf8' }
    ).stdout.trim()
    await mkdir(path.join(temporary, 'bin'))
    await writeFile(
      path.join(temporary, 'bin/gh'),
      `#!${python}\nimport sys\nprint('authentication required',file=sys.stderr)\nsys.exit(4)\n`,
      { mode: 0o755 }
    )
    await writeFile(
      path.join(repo, '.git/hooks/pre-commit'),
      `#!${python}\nimport os,time\nfrom pathlib import Path\nPath(os.environ['CLIENT_HOOK_MARKER']).write_text('started')\ntime.sleep(60)\n`,
      { mode: 0o755 }
    )
    server = spawn(
      binary,
      ['-C', repo, '--config', config, 'serve', '--empty', '--port', '0'],
      { env, stdio: ['ignore', 'ignore', 'pipe'] }
    )
    let output = ''
    server.stderr.on('data', data => {
      output += data.toString()
    })
    await until(
      () => /Open http:\/\/[^\s]+/.test(output),
      'bridge did not start'
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
    const errors = []
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', error => errors.push(error))
    let failConnections = false
    class BrowserSocket extends WebSocket {
      constructor(address) {
        super(address, { origin: new URL(url).origin })
        sockets.push(this)
        if (failConnections) this.once('open', () => this.terminate())
      }
      send(value, ...args) {
        sent.push(JSON.parse(value))
        return super.send(value, ...args)
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
    const status = () => document.querySelector('#connection').textContent
    await until(
      () => status() === 'Ready',
      'application did not initialize: ' + status()
    )
    assert(document.querySelector('#management-root button'))
    const emptyLfs = document.querySelector('#lfs-root')
    emptyLfs.querySelector('details').open = true
    if (hasLfs) {
      assert.equal(
        emptyLfs.querySelector('select[aria-label="LFS configuration scope"]')
          .value,
        'global'
      )
      await until(
        () => sent.some(message => message.method === 'lfs_install'),
        'automatic startup setup did not reach the bridge'
      )
      await until(async () => {
        try {
          return (await readFile(env.GIT_CONFIG_GLOBAL, 'utf8')).includes(
            '[filter "lfs"]'
          )
        } catch {
          return false
        }
      }, 'startup setup did not write isolated global LFS filters')
      assert.deepEqual(
        sent.find(message => message.method === 'lfs_install'),
        {
          id: sent.find(message => message.method === 'lfs_install').id,
          method: 'lfs_install',
          scope: 'global',
          force: false,
          skip_repo: true,
          skip_smudge: false,
          repository_id: null,
        }
      )
    }
    const open = document.querySelector('#open-repository')
    open.querySelector('[name=path]').value = repo
    await until(
      () => status() === 'Ready' && !open.querySelector('button').disabled,
      'empty client did not become ready to open a repository'
    )
    open.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true })
    )
    await until(
      () =>
        status() === 'Ready' &&
        document.querySelector('#repository').textContent === repo,
      'repository did not open after standalone setup'
    )

    if (hasLfs) {
      const initialization = document.querySelector('#lfs-initialization-root')
      const initializationButton = text =>
        [...initialization.querySelectorAll('button')].find(
          button => button.textContent === text
        )
      await until(
        () => initializationButton('Initialize repository LFS'),
        'opening an LFS repository did not offer initialization'
      )
      assert.equal(
        sent.filter(message => message.method === 'lfs_install').length,
        1
      )
      initializationButton('Initialize repository LFS').click()
      await until(
        () =>
          initializationButton('Replace existing LFS filters and hooks') &&
          !initializationButton('Replace existing LFS filters and hooks')
            .disabled,
        'hook conflict did not offer explicit recovery'
      )
      const hookPath = path.join(repo, '.git/hooks/pre-push')
      assert(
        (await readFile(hookPath, 'utf8')).includes(
          'custom-browser-hook-secret'
        )
      )
      assert(!initialization.textContent.includes('custom-browser-hook-secret'))
      const attempted = sent
        .filter(message => message.method === 'lfs_install')
        .at(-1)
      assert.equal(attempted.force, false)
      assert.equal(attempted.skip_repo, false)
      initializationButton('Replace existing LFS filters and hooks').click()
      await until(
        () => !initializationButton('Initialize repository LFS'),
        'explicit hook recovery did not complete'
      )
      const replaced = await readFile(hookPath, 'utf8')
      assert(replaced.includes('git lfs pre-push'))
      assert(!replaced.includes('custom-browser-hook-secret'))
      assert.equal(
        sent.filter(message => message.method === 'lfs_install').at(-1).force,
        true
      )
    }

    const imageRow = () =>
      [...document.querySelectorAll('#files .file')].find(row =>
        row.querySelector('.file-name')?.textContent.endsWith('comparison.png')
      )
    await until(
      () => imageRow() && !imageRow().querySelector('.file-name').disabled,
      'changed PNG did not appear in the client'
    )
    const imageIndexBefore = git('ls-files', '--stage')
    imageRow().querySelector('.file-name').click()
    const imageRoot = document.querySelector('#diff-root')
    await until(
      () => imageRoot.querySelectorAll('img').length === 2,
      'Rust image preview did not reach the client'
    )
    assert.deepEqual(
      [...imageRoot.querySelectorAll('img')].map(image => image.src),
      [imageBefore, imageAfter].map(
        bytes => 'data:image/png;base64,' + bytes.toString('base64')
      )
    )
    for (const name of ['Swipe', 'Onion Skin', 'Difference', '2-up']) {
      const mode = [...imageRoot.querySelectorAll('button')].find(
        button => button.textContent === name
      )
      assert(mode)
      mode.click()
      assert.equal(mode.getAttribute('aria-pressed'), 'true')
    }
    assert(!imageRoot.textContent.includes('Stage selected lines'))
    assert.equal(git('ls-files', '--stage'), imageIndexBefore)
    assert.equal(git('rev-parse', 'HEAD').trim(), original)
    const imageAction = name =>
      [...(imageRow()?.querySelectorAll('button') || [])].find(
        button => button.textContent === name
      )
    await until(
      () => imageAction('Stage') && !imageAction('Stage').disabled,
      'whole-file image staging did not become ready'
    )
    imageAction('Stage').click()
    await until(
      () => imageAction('Staged diff') && !imageAction('Staged diff').disabled,
      'image staging did not refresh the file actions'
    )
    imageAction('Staged diff').click()
    await until(
      () => imageRoot.querySelectorAll('img').length === 2,
      'staged image comparison did not load'
    )
    assert.deepEqual(
      [...imageRoot.querySelectorAll('img')].map(image => image.src),
      [imageBefore, imageAfter].map(
        bytes => 'data:image/png;base64,' + bytes.toString('base64')
      )
    )
    assert(
      sent.some(
        message =>
          message.method === 'diff_detail' &&
          message.path?.bytes &&
          Buffer.from(message.path.bytes).toString() === 'comparison.png' &&
          message.staged
      )
    )
    await until(
      () => imageAction('Unstage') && !imageAction('Unstage').disabled,
      'whole-file image unstaging did not become ready'
    )
    imageAction('Unstage').click()
    await until(
      () => imageAction('Stage') && !imageAction('Staged diff'),
      'image unstaging did not restore working-only changes'
    )
    assert.equal(git('ls-files', '--stage'), imageIndexBefore)
    assert.equal(git('rev-parse', 'HEAD').trim(), original)
    await writeFile(path.join(repo, 'comparison.png'), imageBefore)
    await until(() => !imageRow(), 'clean PNG did not leave the changes list')

    const lfsRoot = document.querySelector('#lfs-root')
    assert(lfsRoot)
    const inspectLfs = [...lfsRoot.querySelectorAll('button')].find(
      button => button.textContent === 'Inspect LFS'
    )
    assert(inspectLfs)
    inspectLfs.click()
    await until(
      () =>
        sent.some(message => message.method === 'lfs_status') &&
        !inspectLfs.disabled &&
        (lfsRoot.textContent.includes('No LFS tracking rules found.') ||
          lfsRoot.textContent.includes(
            'This repository uses LFS tracking rules.'
          ) ||
          lfsRoot.textContent.includes('Install git-lfs')),
      'LFS inspection did not reach the real bridge'
    )
    assert.equal(
      sent.filter(message => message.method === 'lfs_install').length,
      hasLfs ? 3 : 0
    )
    if (hasLfs) {
      const transfers = [...lfsRoot.querySelectorAll('details')].find(
        details =>
          details.querySelector('summary')?.textContent ===
          'LFS transfers and checkout'
      )
      transfers.open = true
      const action = lfsRoot.querySelector('[aria-label="LFS transfer action"]')
      action.value = 'push'
      action.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      const dry = [...lfsRoot.querySelectorAll('label')]
        .find(label => label.textContent.includes('Dry run'))
        .querySelector('input')
      const upload = [...lfsRoot.querySelectorAll('button')].find(
        button => button.textContent === 'Upload LFS objects'
      )
      const baseHash = createHash('sha256').update(lfsBase).digest('hex')
      const remoteObject = path.join(
        lfsRemote,
        'lfs/objects',
        baseHash.slice(0, 2),
        baseHash.slice(2, 4),
        baseHash
      )
      dry.click()
      upload.click()
      await until(
        () => !upload.disabled && lfsRoot.textContent.includes(baseHash),
        'LFS upload dry-run did not reach the real bridge'
      )
      await assert.rejects(
        access(remoteObject),
        error => error.code === 'ENOENT'
      )
      dry.click()
      upload.click()
      await until(async () => {
        try {
          return (
            !upload.disabled &&
            (await readFile(remoteObject, 'utf8')) === lfsBase
          )
        } catch {
          return false
        }
      }, 'LFS upload did not store the verified payload in the local test remote')
      assert.equal(git('rev-parse', 'HEAD').trim(), original)
      assert.equal(
        sent.filter(message => message.method === 'lfs_transfer').length,
        2
      )
      transfers.open = false
      const row = () =>
        [...document.querySelectorAll('#files .file')].find(item =>
          item.textContent.includes(lfsName)
        )
      const diff = document.querySelector('#diff-root')
      const diffButton = label =>
        [...diff.querySelectorAll('button')].find(item =>
          item.textContent.startsWith(label)
        )
      await until(() => row(), 'LFS file did not appear in the real client')
      row().querySelector('.file-name').click()
      await until(
        () =>
          diff.textContent.includes('Verified local payload.') &&
          diff.querySelector('.diff-added code')?.textContent.endsWith('BETA'),
        () =>
          'LFS body was not rendered through the bridge: ' + diff.textContent
      )
      diffButton('Select all changes').click()
      diffButton('Stage selected lines').click()
      const expected = body => createHash('sha256').update(body).digest('hex')
      await until(
        () => git('show', ':data.lfs').includes(expected(lfsEdited)),
        'client did not stage an LFS payload pointer'
      )
      await until(
        () =>
          row() &&
          [...row().querySelectorAll('button')].some(
            button => button.textContent === 'Staged diff' && !button.disabled
          ),
        'staged LFS state did not refresh'
      )
      ;[...row().querySelectorAll('button')]
        .find(button => button.textContent === 'Staged diff')
        .click()
      await until(
        () =>
          diffButton('Unstage selected lines') &&
          !diffButton('Select all changes').disabled,
        () =>
          'staged LFS diff did not load: ' +
          status() +
          ' / ' +
          diff.textContent +
          ' / requests ' +
          sent
            .filter(message => message.method === 'diff_detail')
            .map(message => String(message.staged))
            .join(',')
      )
      diffButton('Select all changes').click()
      diffButton('Unstage selected lines').click()
      await until(
        () => git('show', ':data.lfs').includes(expected(lfsBase)),
        'client did not unstage the LFS selection'
      )
      await writeFile(path.join(repo, lfsName), lfsBase)
      await until(() => !row(), 'clean LFS file did not leave the changes list')
      assert(
        sent.filter(message => message.method === 'select_diff').length >= 2
      )
    }

    assert(
      !dom.window.location.hash,
      'session credential should leave the address bar'
    )
    const form = document.querySelector('#commit')
    await until(
      () => status() === 'Ready' && !form.querySelector('button').disabled,
      () => 'client did not settle after LFS refresh: ' + status()
    )
    const setSummary = value => {
      const input = form.querySelector('[name=summary]')
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      ).set.call(input, value)
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }
    setSummary('must not commit')
    const submit = () =>
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
    submit()
    await until(
      async () => {
        try {
          await access(marker)
          return true
        } catch {
          return false
        }
      },
      () =>
        'commit hook did not run: ' +
        status() +
        ' (sent ' +
        sent.map(message => message.method).join(',') +
        ')'
    )
    const cancel = document.querySelector('#cancel-work')
    assert(!cancel.disabled, 'cancellation must remain available while busy')
    cancel.click()
    await until(
      () => status().startsWith('Cancelled.'),
      'cancelled work did not refresh: ' + status()
    )
    assert.equal(git('rev-parse', 'HEAD').trim(), original)
    assert.equal(git('show', ':file.txt'), 'staged\n')
    assert(sent.some(message => message.method === 'cancel'))
    const discardRoot = document.querySelector('#discard-root')
    const discardButton = [...document.querySelectorAll('#files button')].find(
      button => button.textContent === 'Discard…'
    )
    assert(discardButton)
    discardButton.click()
    const control = text =>
      [...discardRoot.querySelectorAll('button')].find(
        button => button.textContent === text
      )
    await until(
      () =>
        control('Discard reviewed changes') &&
        !control('Discard reviewed changes').disabled,
      'discard review did not load'
    )
    assert.equal(
      sent.filter(message => message.method === 'discard').length,
      0,
      'preview mutated files'
    )
    assert.equal(git('show', ':file.txt'), 'staged\n')
    control('Discard reviewed changes').click()
    await until(
      () => control('Undo discard') && !control('Undo discard').disabled,
      'discard did not expose undo'
    )
    assert.equal(git('show', ':file.txt'), 'initial\n')
    control('Undo discard').click()
    await until(
      () => discardRoot.textContent.includes('Discarded changes restored.'),
      () => 'undo did not finish: ' + discardRoot.textContent
    )
    assert.equal(git('show', ':file.txt'), 'staged\n')
    assert.equal(
      typeof sent.find(message => message.method === 'undo_discard').undo_id,
      'string'
    )
    assert.equal(git('rev-parse', 'HEAD').trim(), original)
    await until(
      () => !document.querySelector('#commit button').disabled,
      'commit stayed disabled after undo'
    )

    // Drop a second commit, hold reconnection offline, and change preferences externally.
    await rm(marker)
    submit()
    await until(async () => {
      try {
        await access(marker)
        return true
      } catch {
        return false
      }
    }, 'second hook did not run')
    failConnections = true
    sockets.at(-1).terminate()
    await until(
      () =>
        status().includes('Disconnected') || status().includes('Reconnecting'),
      'disconnect did not update UI'
    )
    const changed = spawnSync(
      binary,
      ['--config', config, 'preferences', 'set', '{"theme":"dark"}'],
      { env, encoding: 'utf8' }
    )
    assert.equal(changed.status, 0, changed.stderr)
    await wait(600)
    failConnections = false
    const reconnect = document.querySelector('#reconnect')
    reconnect.click()
    await until(
      () =>
        status() === 'Ready' &&
        document.documentElement.dataset.theme === 'dark',
      'reconnect did not refresh state/preferences: ' + status()
    )
    assert.equal(
      sent.filter(message => message.method === 'commit').length,
      2,
      'reconnection replayed a mutation'
    )
    assert.equal(
      sent.filter(message => message.method === 'lfs_install').length,
      hasLfs ? 3 : 0,
      'reconnecting replayed LFS initialization'
    )
    assert.equal(git('rev-parse', 'HEAD').trim(), original)
    await until(async () => {
      try {
        await access(path.join(repo, '.git/index.lock'))
        return false
      } catch {
        return true
      }
    }, 'disconnect left Git index locked')
    // Complete a normal reviewed commit after exercising interruption/reconnect.
    await rm(path.join(repo, '.git/hooks/pre-commit'))
    await until(
      () => !form.querySelector('button').disabled,
      'commit did not become available after reconnect'
    )
    setSummary('successful reviewed commit')
    submit()
    await until(
      () =>
        form.textContent.includes('Commit created') &&
        !form.querySelector('button').disabled,
      () => 'reviewed commit did not complete: ' + form.textContent
    )
    assert.equal(
      git('log', '-1', '--format=%s').trim(),
      'successful reviewed commit'
    )
    assert.equal(form.querySelector('[name=summary]').value, '')
    assert.equal(sent.filter(message => message.method === 'commit').length, 3)
    // The complete browser flow must review actual staged content even when
    // the file is now tiny in the working tree.
    const oversizedPath = path.join(repo, 'oversized.bin')
    const oversized = await openFile(oversizedPath, 'w')
    await oversized.truncate(100 * 1024 * 1024 + 1)
    await oversized.close()
    git('add', '--', 'oversized.bin')
    await writeFile(oversizedPath, '')
    const beforeWarning = git('rev-parse', 'HEAD').trim()
    setSummary('explicit large file consent')
    await until(
      () => !form.querySelector('button').disabled,
      'commit did not settle after staging the oversized blob'
    )
    submit()
    const confirm = () =>
      [...form.querySelectorAll('button')].find(
        button => button.textContent === 'Commit anyway'
      )
    await until(
      () => confirm() && !confirm().disabled,
      () =>
        'large file review did not load: ' +
        form.textContent +
        '; reviews=' +
        sent.filter(message => message.method === 'commit_preview').length
    )
    assert(form.textContent.includes('oversized.bin'))
    assert(form.textContent.includes('104857601 bytes'))
    assert.equal(git('rev-parse', 'HEAD').trim(), beforeWarning)
    assert.equal(sent.filter(message => message.method === 'commit').length, 3)
    confirm().click()
    await until(
      () =>
        form.textContent.includes('Commit created') &&
        !form.querySelector('button').disabled,
      () => 'explicit large file commit did not finish: ' + form.textContent
    )
    const largeCommit = sent
      .filter(message => message.method === 'commit')
      .at(-1)
    assert.equal(largeCommit.allow_large_files, true)
    assert.equal(typeof largeCommit.basis, 'string')
    assert.equal(
      git('cat-file', '-s', 'HEAD:oversized.bin').trim(),
      '104857601'
    )
    assert.equal(form.querySelector('[name=summary]').value, '')
    // Repository contribution preferences remain usable without contacting
    // GitHub. The server receives only the reviewed choice and certificate.
    const contribution = document.querySelector('.repository-context')
    contribution.open = true
    const contributionButton = label =>
      [...contribution.querySelectorAll('button')].find(
        button => button.textContent === label
      )
    await until(
      () => !contributionButton('Load contribution settings').disabled,
      'contribution settings did not become ready'
    )
    assert.equal(
      sent.filter(message => message.method === 'repository_context').length,
      0
    )
    contributionButton('Load contribution settings').click()
    await until(
      () =>
        contribution.querySelector('select') &&
        !contributionButton('Load contribution settings').disabled,
      () =>
        'cached contribution settings did not load: ' + contribution.textContent
    )
    assert.equal(contribution.querySelector('select').value, 'parent')
    assert(contributionButton('Save contribution target').disabled)
    contribution.querySelector('select').value = 'self'
    contribution
      .querySelector('select')
      .dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    await until(
      () => !contributionButton('Save contribution target').disabled,
      'reviewed contribution target could not be saved'
    )
    contributionButton('Save contribution target')
      .closest('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
    await until(
      () =>
        contribution.textContent.includes('Contribution target saved.') &&
        !contributionButton('Load contribution settings').disabled,
      () => 'contribution preference did not save: ' + contribution.textContent
    )
    const contributionSave = sent.find(
      message => message.method === 'set_fork_contribution_target'
    )
    assert.deepEqual(Object.keys(contributionSave).sort(), [
      'basis',
      'id',
      'method',
      'repository_id',
      'target',
    ])
    assert.equal(contributionSave.target, 'self')
    assert.equal(typeof contributionSave.basis, 'string')
    assert.equal(typeof contributionSave.repository_id, 'string')
    const contributionFile = path.join(repo, '.git/desktop-repository.json'),
      contributionStored = JSON.parse(await readFile(contributionFile, 'utf8'))
    assert.equal(contributionStored.fork_contribution_target, 'self')
    const commonGitDirectory = await realpath(
      git('rev-parse', '--path-format=absolute', '--git-common-dir').trim()
    )
    const contributionIdentityFile = path.join(
        commonGitDirectory,
        'desktop-repository.id'
      ),
      contributionIdentity = (
        await readFile(contributionIdentityFile, 'utf8')
      ).trim()
    assert.match(
      contributionIdentity,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    assert.equal(contributionStored.repository_id, contributionIdentity)
    if (process.platform !== 'win32') {
      assert.equal((await stat(contributionFile)).mode & 0o777, 0o600)
      assert.equal((await stat(contributionIdentityFile)).mode & 0o777, 0o600)
    }
    contributionButton('Load contribution settings').click()
    await until(
      () =>
        contribution.querySelector('select')?.value === 'self' &&
        !contributionButton('Load contribution settings').disabled,
      () =>
        'saved contribution preference did not reload: ' +
        contribution.textContent
    )
    assert(contributionButton('Save contribution target').disabled)
    assert.equal(
      sent.filter(message => message.method === 'set_fork_contribution_target')
        .length,
      1,
      'loading contribution settings replayed a preference mutation'
    )
    assert.equal(
      sent.filter(message => message.method === 'refresh_repository_context')
        .length,
      0,
      'offline preference flow refreshed GitHub metadata'
    )
    assert.equal(
      errors.length,
      0,
      errors.map(error => error.message).join('\n')
    )
  } finally {
    // Stop the bridge before closing jsdom so reconnect timers cannot create new sockets.
    if (server && server.exitCode === null) {
      server.kill('SIGINT')
      const killTimer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }, 6000)
      try {
        await once(server, 'exit')
      } finally {
        clearTimeout(killTimer)
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
