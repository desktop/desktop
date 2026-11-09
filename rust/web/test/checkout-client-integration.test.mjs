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
  const deadline = performance.now() + 18000
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
function input(container, text) {
  return [...container.querySelectorAll('label')]
    .find(label => label.textContent.includes(text))
    .querySelector('input')
}

test(
  'localhost branch switching leaves/restores/brings changes, retains conflict recovery and opens registered worktrees',
  { timeout: 120000 },
  async () => {
    const temporary = await mkdtemp(
        path.join(os.tmpdir(), 'desktop-checkout-client-')
      ),
      repo = path.join(temporary, 'source'),
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
    const calls = [],
      sockets = [],
      errors = []
    let server, dom
    function gitAt(directory, ...args) {
      const result = spawnSync('git', ['-C', directory, ...args], {
        env,
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout
    }
    const git = (...args) => gitAt(repo, ...args)
    const base = Array.from({ length: 30 }, (_, n) => `line ${n}\n`).join(''),
      staged = base.replace('line 0\n', 'staged 0\n'),
      working = staged.replace('line 14\n', 'working 14\n')
    try {
      await mkdir(repo)
      git('init', '-qb', 'main')
      git('config', 'user.name', 'Checkout Browser')
      git('config', 'user.email', 'checkout-browser@example.invalid')
      git('config', 'commit.gpgsign', 'false')
      await writeFile(path.join(repo, 'file.txt'), base)
      git('add', '--', 'file.txt')
      git('commit', '-qm', 'base')
      git('tag', 'main')
      git('remote', 'add', 'origin', path.join(temporary, 'not-contacted'))
      git(
        'update-ref',
        'refs/remotes/origin/remote-topic',
        git('rev-parse', 'HEAD').trim()
      )
      git('branch', 'origin/remote-topic', 'refs/heads/main')
      git('branch', 'refs/remotes/origin/remote-topic', 'refs/heads/main')
      git('switch', '-qc', 'other')
      await writeFile(
        path.join(repo, 'file.txt'),
        base.replace('line 29\n', 'target 29\n')
      )
      git('commit', '-qam', 'other')
      git('switch', '-q', 'main')
      await writeFile(path.join(repo, 'file.txt'), 'previous saved changes\n')
      git('stash', 'push', '-qm', '!!GitHub_Desktop<main>')
      const oldStash = git('rev-parse', 'refs/stash').trim()
      await writeFile(path.join(repo, 'file.txt'), staged)
      git('add', '--', 'file.txt')
      await writeFile(path.join(repo, 'file.txt'), working)
      await writeFile(path.join(repo, 'new.txt'), 'untracked work\n')
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
        'checkout bridge did not start'
      )
      const url = /Open (http:\/\/[^\s]+)/.exec(output)[1],
        html = await (await fetch(url.split('#')[0])).text()
      const bundle = await build({
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
      dom.window.eval(bundle.outputFiles[0].text)
      const document = dom.window.document,
        checkout = document.querySelector('#checkout-root'),
        stash = document.querySelector('#stash-root'),
        recovery = document.querySelector('#recovery-root')
      async function choose(name) {
        const value = name.startsWith('refs/') ? name : `refs/heads/${name}`
        await until(
          () =>
            document.querySelector('#checkout') &&
            !document.querySelector('#checkout').disabled &&
            [...document.querySelector('#branches').options].some(
              option => option.value === value
            ),
          () =>
            `branch selector not ready for ${name}: ${
              document.querySelector('#connection').textContent
            }; ${checkout.textContent}`
        )
        document.querySelector('#branches').value = value
        document.querySelector('#checkout').click()
      }
      async function readyBranch(name) {
        await until(
          () =>
            document.querySelector('#branch').textContent === name &&
            !document.querySelector('#checkout').disabled,
          () =>
            `branch ${name} not ready: ${checkout.textContent}; ${
              document.querySelector('#connection').textContent
            }`
        )
      }
      await readyBranch('main')
      assert(
        [...document.querySelector('#branches').options].some(
          option => option.value === 'refs/remotes/origin/remote-topic'
        )
      )
      await choose('other')
      await until(
        () => button(checkout, 'Switch branch'),
        'branch review did not open'
      )
      assert(button(checkout, 'Switch branch').disabled)
      assert.equal(await readFile(path.join(repo, 'file.txt'), 'utf8'), working)
      input(checkout, 'Replace my previous saved stash').click()
      button(checkout, 'Switch branch').click()
      await readyBranch('other')
      assert.equal(git('status', '--porcelain'), '')
      assert.equal(
        await readFile(path.join(repo, 'file.txt'), 'utf8'),
        base.replace('line 29\n', 'target 29\n')
      )
      const saved = git('rev-parse', 'refs/stash').trim()
      assert.notEqual(saved, oldStash)
      assert.equal(git('show', saved + ':file.txt'), working)
      await choose('main')
      await readyBranch('main')
      assert.equal(await readFile(path.join(repo, 'file.txt'), 'utf8'), base)
      await until(
        () =>
          button(stash, 'Inspect stash@{0}') &&
          !button(stash, 'Inspect stash@{0}').disabled,
        'branch stash was not refreshed'
      )
      button(stash, 'Inspect stash@{0}').click()
      await until(
        () =>
          button(stash, 'Apply (keep stash)') &&
          !button(stash, 'Apply (keep stash)').disabled,
        'branch stash inspection failed'
      )
      input(stash, 'Restore the saved index').click()
      button(stash, 'Apply (keep stash)').click()
      await until(
        () =>
          stash.textContent.includes('Stash applied; saved entry kept') &&
          !button(stash, 'Refresh stashes').disabled,
        'saved branch work was not restored'
      )
      assert.equal(await readFile(path.join(repo, 'file.txt'), 'utf8'), working)
      assert.equal(git('show', ':file.txt'), staged)
      await choose('other')
      await until(
        () => button(checkout, 'Switch branch'),
        'bring review missing'
      )
      input(checkout, 'Bring my changes').click()
      input(
        checkout,
        'Restore the saved index if a temporary stash is needed'
      ).click()
      input(checkout, 'Remember this choice').click()
      button(checkout, 'Switch branch').click()
      await readyBranch('other')
      assert.equal(
        await readFile(path.join(repo, 'file.txt'), 'utf8'),
        working.replace('line 29\n', 'target 29\n')
      )
      assert.equal(
        git('show', ':file.txt'),
        staged.replace('line 29\n', 'target 29\n')
      )
      assert.equal(git('rev-parse', 'refs/stash').trim(), saved)
      assert.equal(
        JSON.parse(
          await readFile(config.replace('.json', '.preferences.json'), 'utf8')
        ).uncommitted_changes,
        'MoveToNewBranch'
      )
      // The remembered choice carries work back without opening a second dialog.
      await choose('main')
      await readyBranch('main')
      assert.equal(await readFile(path.join(repo, 'file.txt'), 'utf8'), working)
      const collisionTree = path.join(temporary, 'collision-tree')
      git(
        'worktree',
        'add',
        '-qb',
        'collision',
        collisionTree,
        'refs/heads/main'
      )
      await writeFile(
        path.join(collisionTree, 'file.txt'),
        base
          .replace('line 0\n', 'committed collision 0\n')
          .replace('line 14\n', 'committed collision 14\n')
      )
      gitAt(collisionTree, 'commit', '-qam', 'collision')
      git('worktree', 'remove', collisionTree)
      document.querySelector('#refresh').click()
      await choose('collision')
      await until(
        () =>
          recovery.textContent.includes('Inspect conflict: file.txt') &&
          checkout.textContent.includes('collision: applying'),
        'conflicted bring did not expose recovery'
      )
      assert(git('ls-files', '-u'))
      assert.equal(git('stash', 'list').trim().split('\n').length, 2)
      const attempts = calls.filter(
        call =>
          call.method === 'checkout' && call.branch === 'refs/heads/collision'
      ).length
      document.querySelector('#refresh').click()
      await until(
        () => !document.querySelector('#refresh').disabled,
        'refresh did not finish'
      )
      assert.equal(
        calls.filter(
          call =>
            call.method === 'checkout' && call.branch === 'refs/heads/collision'
        ).length,
        attempts
      )
      button(recovery, 'Inspect conflict: file.txt').click()
      await until(
        () => button(recovery, 'Use ours and stage'),
        'conflict choices did not load'
      )
      button(recovery, 'Use ours and stage').click()
      await until(
        () => recovery.textContent.includes('Resolution staged'),
        'conflict resolution failed'
      )
      assert.equal(git('ls-files', '-u'), '')
      const content = await readFile(path.join(repo, 'file.txt'), 'utf8')
      assert(content.includes('committed collision 0'))
      assert(content.includes('committed collision 14'))
      await until(
        () =>
          button(checkout, 'Acknowledge switch record') &&
          !button(checkout, 'Acknowledge switch record').disabled,
        'failed receipt not available'
      )
      button(checkout, 'Acknowledge switch record').click()
      await until(
        () => !checkout.textContent.includes('collision: applying'),
        'receipt was not acknowledged'
      )
      assert.equal(git('stash', 'list').trim().split('\n').length, 2)
      const held = path.join(temporary, 'held other')
      git('worktree', 'add', '-q', held, 'other')
      const before = git('status', '--porcelain')
      document.querySelector('#refresh').click()
      await choose('other')
      await until(
        () =>
          document.querySelector('#repository').textContent === held &&
          document.querySelector('#branch').textContent === 'other',
        'registered worktree was not opened'
      )
      assert.equal(git('status', '--porcelain'), before)
      assert.equal(await readFile(path.join(repo, 'file.txt'), 'utf8'), content)
      await choose('origin/remote-topic')
      await readyBranch('origin/remote-topic')
      assert.equal(
        document.querySelector('#branches').value,
        'refs/heads/origin/remote-topic'
      )
      await choose('refs/heads/refs/remotes/origin/remote-topic')
      await readyBranch('refs/remotes/origin/remote-topic')
      assert.equal(
        document.querySelector('#branches').value,
        'refs/heads/refs/remotes/origin/remote-topic'
      )
      await choose('refs/remotes/origin/remote-topic')
      await readyBranch('remote-topic')
      assert.equal(
        gitAt(held, 'config', 'branch.remote-topic.remote'),
        'origin\n'
      )
      assert.equal(
        gitAt(held, 'config', 'branch.remote-topic.merge'),
        'refs/heads/remote-topic\n'
      )
      // The production recovery form reviews and renames the native branch,
      // carrying its staged/working/untracked saved data into the new name.
      await writeFile(path.join(held, 'file.txt'), 'rename index\n')
      gitAt(held, 'add', '--', 'file.txt')
      await writeFile(path.join(held, 'file.txt'), 'rename working\n')
      await writeFile(path.join(held, 'rename-untracked'), 'rename untracked\n')
      gitAt(
        held,
        'stash',
        'push',
        '--include-untracked',
        '-m',
        '!!GitHub_Desktop<remote-topic>'
      )
      const originalRenameStash = gitAt(held, 'rev-parse', 'refs/stash').trim()
      const renameRoot = recovery.querySelector('.branch-rename')
      const renameInput = input(renameRoot, 'Rename current branch')
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      ).set.call(renameInput, 'renamed-topic')
      renameInput.dispatchEvent(
        new dom.window.Event('input', { bubbles: true })
      )
      button(renameRoot, 'Review branch rename')
        .closest('form')
        .dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true })
        )
      await until(
        () => button(renameRoot, 'Confirm branch rename'),
        'rename review did not open'
      )
      assert(renameRoot.textContent.includes('Move 1 saved change sets'))
      assert(
        renameRoot.textContent.includes('This branch has a configured upstream')
      )
      assert.equal(
        gitAt(held, 'symbolic-ref', 'HEAD'),
        'refs/heads/remote-topic\n'
      )
      button(renameRoot, 'Confirm branch rename').click()
      await readyBranch('renamed-topic')
      const renamedStash = gitAt(held, 'rev-parse', 'refs/stash').trim()
      assert.notEqual(renamedStash, originalRenameStash)
      assert.equal(
        gitAt(held, 'show', renamedStash + ':file.txt'),
        'rename working\n'
      )
      assert.equal(
        gitAt(held, 'show', renamedStash + '^2:file.txt'),
        'rename index\n'
      )
      assert.equal(
        gitAt(held, 'show', renamedStash + '^3:rename-untracked'),
        'rename untracked\n'
      )
      assert.equal(
        gitAt(held, 'config', 'branch.renamed-topic.merge'),
        'refs/heads/remote-topic\n'
      )
      assert.equal(gitAt(held, 'status', '--porcelain'), '')
      const renameCall = calls.find(call => call.method === 'rename_branch')
      assert.equal(renameCall.name, 'refs/heads/remote-topic')
      assert.equal(renameCall.new_name, 'renamed-topic')
      assert.equal(typeof renameCall.basis, 'string')
      // Creating through the actual sidebar uses the same certified leave/bring
      // review, including explicit replacement of the current branch stash.
      await writeFile(path.join(held, 'file.txt'), 'create index\n')
      gitAt(held, 'add', '--', 'file.txt')
      await writeFile(path.join(held, 'file.txt'), 'create working\n')
      await writeFile(path.join(held, 'create-untracked'), 'create untracked\n')
      const createForm = document.querySelector('#create-branch')
      function editCreate(name, value) {
        const element = createForm.elements.namedItem(name)
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          'value'
        ).set.call(element, value)
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      }
      editCreate('name', 'created-from-review')
      editCreate('start_point', 'refs/heads/main')
      createForm.elements.namedItem('no_track').click()
      createForm.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
      await until(
        () => button(checkout, 'Create and switch branch'),
        () =>
          `creation review did not open: ${checkout.textContent}; connection=${
            document.querySelector('#connection').textContent
          }; calls=${JSON.stringify(
            calls.filter(call => call.method?.includes('create_branch'))
          )}`
      )
      assert.equal(
        gitAt(
          held,
          'for-each-ref',
          '--format=%(objectname)',
          'refs/heads/created-from-review'
        ),
        ''
      )
      assert.equal(
        gitAt(held, 'symbolic-ref', 'HEAD'),
        'refs/heads/renamed-topic\n'
      )
      input(checkout, 'Leave my changes on renamed-topic').click()
      assert(button(checkout, 'Create and switch branch').disabled)
      input(checkout, 'Replace my previous saved stash').click()
      button(checkout, 'Create and switch branch').click()
      await readyBranch('created-from-review')
      const createdStash = gitAt(held, 'rev-parse', 'refs/stash').trim()
      assert.notEqual(createdStash, renamedStash)
      assert.equal(
        gitAt(held, 'show', createdStash + ':file.txt'),
        'create working\n'
      )
      assert.equal(
        gitAt(held, 'show', createdStash + '^2:file.txt'),
        'create index\n'
      )
      assert.equal(
        gitAt(held, 'show', createdStash + '^3:create-untracked'),
        'create untracked\n'
      )
      assert.equal(gitAt(held, 'status', '--porcelain'), '')
      const createCall = calls.find(call => call.method === 'create_branch')
      assert.equal(createCall.name, 'created-from-review')
      assert.equal(createCall.start_point, 'refs/heads/main')
      assert.equal(createCall.no_track, true)
      assert.equal(createCall.strategy, 'StashOnCurrentBranch')
      assert.equal(createCall.replace_stash, true)
      assert.equal(typeof createCall.basis, 'string')
      // Ref-only creation preserves the current staged/working/untracked state.
      await writeFile(path.join(held, 'file.txt'), 'ref-only index\n')
      gitAt(held, 'add', '--', 'file.txt')
      await writeFile(path.join(held, 'file.txt'), 'ref-only working\n')
      await writeFile(path.join(held, 'ref-only-loose'), 'ref-only untracked\n')
      editCreate('name', 'ref-only')
      editCreate('start_point', 'HEAD~0')
      createForm.elements.namedItem('checkout').click()
      createForm.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
      await until(
        () => button(checkout, 'Create branch'),
        'ref-only review did not open'
      )
      button(checkout, 'Create branch').click()
      await until(
        () =>
          checkout.querySelector('[role=status]').textContent ===
          'Branch created',
        'ref-only creation did not finish'
      )
      assert.equal(
        gitAt(held, 'symbolic-ref', 'HEAD'),
        'refs/heads/created-from-review\n'
      )
      assert(
        gitAt(
          held,
          'for-each-ref',
          '--format=%(objectname)',
          'refs/heads/ref-only'
        ).trim()
      )
      assert.equal(gitAt(held, 'show', ':file.txt'), 'ref-only index\n')
      assert.equal(
        await readFile(path.join(held, 'file.txt'), 'utf8'),
        'ref-only working\n'
      )
      assert.equal(
        await readFile(path.join(held, 'ref-only-loose'), 'utf8'),
        'ref-only untracked\n'
      )
      // Current-branch deletion uses the reviewed checkout and leaves its saved
      // bytes reachable; restoring the retained tip/settings does not switch.
      gitAt(
        held,
        'config',
        'branch.created-from-review.description',
        'Browser recovery settings'
      )
      const deletion = recovery.querySelector('.branch-delete')
      await until(
        () =>
          deletion.querySelector('select') &&
          !deletion.querySelector('select').disabled &&
          [...deletion.querySelector('select').options].some(
            option => option.value === 'refs/heads/created-from-review'
          ),
        'deletion selector did not load'
      )
      deletion.querySelector('select').value = 'refs/heads/created-from-review'
      deletion
        .querySelector('select')
        .dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      button(deletion, 'Review branch deletion')
        .closest('form')
        .dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true })
        )
      await until(
        () =>
          button(deletion, 'Delete reviewed branch') &&
          !button(deletion, 'Delete reviewed branch').disabled,
        () => `delete review did not load: ${deletion.textContent}`
      )
      assert(deletion.textContent.includes('Switch to main before deleting'))
      button(deletion, 'Delete reviewed branch').click()
      await readyBranch('main')
      await until(
        () =>
          button(deletion, 'Restore deleted branch') &&
          !button(deletion, 'Restore deleted branch').disabled,
        () => `delete did not complete: ${deletion.textContent}`
      )
      assert.equal(
        gitAt(
          held,
          'for-each-ref',
          '--format=%(objectname)',
          'refs/heads/created-from-review'
        ),
        ''
      )
      const deletedStash = gitAt(held, 'rev-parse', 'refs/stash').trim()
      assert.equal(
        gitAt(held, 'show', deletedStash + ':file.txt'),
        'ref-only working\n'
      )
      assert.equal(
        gitAt(held, 'show', deletedStash + '^2:file.txt'),
        'ref-only index\n'
      )
      assert.equal(
        gitAt(held, 'show', deletedStash + '^3:ref-only-loose'),
        'ref-only untracked\n'
      )
      const deleteCall = calls.find(call => call.method === 'delete_branch')
      assert.equal(deleteCall.name, 'refs/heads/created-from-review')
      assert.equal(deleteCall.strategy, 'StashOnCurrentBranch')
      assert.equal(typeof deleteCall.basis, 'string')
      button(deletion, 'Restore deleted branch').click()
      await until(
        () =>
          deletion.textContent.includes(
            'Branch tip and settings restored without switching'
          ),
        () => `branch restore did not finish: ${deletion.textContent}`
      )
      assert(
        gitAt(
          held,
          'for-each-ref',
          '--format=%(objectname)',
          'refs/heads/created-from-review'
        ).trim()
      )
      assert.equal(gitAt(held, 'symbolic-ref', 'HEAD'), 'refs/heads/main\n')
      assert.equal(
        gitAt(held, 'config', 'branch.created-from-review.description'),
        'Browser recovery settings\n'
      )
      assert.equal(gitAt(held, 'rev-parse', 'refs/stash').trim(), deletedStash)
      // The production panel deletes through the real authenticated bridge,
      // retains the server tip, and restores locally without another checkout.
      const remoteServer = path.join(temporary, 'remote-delete-server')
      await mkdir(remoteServer)
      gitAt(remoteServer, 'init', '-q', '--bare')
      gitAt(held, 'remote', 'add', 'deletions', remoteServer)
      gitAt(held, 'push', '-q', 'deletions', 'HEAD:refs/heads/server-topic')
      const remoteTip = gitAt(held, 'rev-parse', 'HEAD').trim(),
        remoteDelete = document.querySelector('.remote-delete')
      await until(
        () => !button(remoteDelete, 'Refresh remote deletion history').disabled,
        'remote management was not ready'
      )
      button(remoteDelete, 'Refresh remote deletion history').click()
      await until(
        () =>
          [...remoteDelete.querySelector('select').options].some(
            option => option.value === 'deletions'
          ) &&
          !button(remoteDelete, 'Refresh remote deletion history').disabled,
        () => `remote choices did not load: ${remoteDelete.textContent}`
      )
      remoteDelete.querySelector('select').value = 'deletions'
      remoteDelete
        .querySelector('select')
        .dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      function enterRemote(label, value) {
        const node = input(remoteDelete, label)
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          'value'
        ).set.call(node, value)
        node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      }
      enterRemote('Remote branch', 'refs/heads/server-topic')
      button(remoteDelete, 'Review remote deletion')
        .closest('form')
        .dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true })
        )
      await until(
        () => button(remoteDelete, 'Delete reviewed remote branch'),
        () => `remote review missing: ${remoteDelete.textContent}`
      )
      assert(button(remoteDelete, 'Delete reviewed remote branch').disabled)
      input(remoteDelete, 'Delete the reviewed remote branch').click()
      button(remoteDelete, 'Delete reviewed remote branch').click()
      await until(
        () =>
          button(remoteDelete, 'Restore remote tip locally') &&
          !button(remoteDelete, 'Refresh remote deletion history').disabled,
        () => `remote deletion failed: ${remoteDelete.textContent}`
      )
      assert.equal(
        gitAt(
          remoteServer,
          'for-each-ref',
          '--format=%(objectname)',
          'refs/heads/server-topic'
        ),
        ''
      )
      enterRemote(
        'Restore remote tip as local branch',
        'browser-retained-remote'
      )
      button(remoteDelete, 'Restore remote tip locally').click()
      await until(
        () =>
          remoteDelete.textContent.includes(
            'Remote tip restored locally without switching'
          ) &&
          !button(remoteDelete, 'Refresh remote deletion history').disabled,
        () => `remote tip restore failed: ${remoteDelete.textContent}`
      )
      assert.equal(
        gitAt(held, 'rev-parse', 'refs/heads/browser-retained-remote').trim(),
        remoteTip
      )
      assert.equal(gitAt(held, 'symbolic-ref', 'HEAD'), 'refs/heads/main\n')
      assert.equal(gitAt(held, 'rev-parse', 'refs/stash').trim(), deletedStash)
      assert.equal(
        calls.filter(call => call.method === 'delete_remote_branch').length,
        1
      )
      gitAt(
        held,
        'push',
        '-q',
        'deletions',
        'browser-retained-remote:refs/heads/server-combined'
      )
      gitAt(
        held,
        'config',
        'branch.browser-retained-remote.remote',
        'deletions'
      )
      gitAt(
        held,
        'config',
        'branch.browser-retained-remote.merge',
        'refs/heads/server-combined'
      )
      await until(
        () =>
          [...deletion.querySelector('select').options].some(
            option => option.value === 'refs/heads/browser-retained-remote'
          ) && !deletion.querySelector('select').disabled,
        () =>
          `remote restore did not refresh local choices: ${deletion.textContent}`
      )
      deletion.querySelector('select').value =
        'refs/heads/browser-retained-remote'
      deletion
        .querySelector('select')
        .dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      await until(
        () => !button(deletion, 'Review branch deletion').disabled,
        'restored nondefault deletion was disabled'
      )
      input(deletion, 'Also delete this branch’s configured upstream').click()
      button(deletion, 'Review branch deletion')
        .closest('form')
        .dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true })
        )
      await until(
        () =>
          button(deletion, 'Delete reviewed branch') &&
          !input(deletion, 'Delete this reviewed upstream after local deletion')
            .disabled,
        () => `combined review did not load: ${deletion.textContent}`
      )
      assert(button(deletion, 'Delete reviewed branch').disabled)
      assert(deletion.textContent.includes('refs/heads/server-combined'))
      input(
        deletion,
        'Delete this reviewed upstream after local deletion'
      ).click()
      button(deletion, 'Delete reviewed branch').click()
      await until(
        () =>
          deletion.textContent.includes(
            'Local branch and upstream deleted; linked recovery is available.'
          ) && !deletion.querySelector('select').disabled,
        () => `combined deletion failed: ${deletion.textContent}`
      )
      assert.equal(
        gitAt(
          held,
          'for-each-ref',
          '--format=%(objectname)',
          'refs/heads/browser-retained-remote'
        ),
        ''
      )
      assert.equal(
        gitAt(
          remoteServer,
          'for-each-ref',
          '--format=%(objectname)',
          'refs/heads/server-combined'
        ),
        ''
      )
      await until(
        () =>
          remoteDelete.textContent.includes('Related local deletion record:'),
        () =>
          `linked upstream history did not refresh: ${remoteDelete.textContent}`
      )
      assert.equal(gitAt(held, 'symbolic-ref', 'HEAD'), 'refs/heads/main\n')
      assert.equal(gitAt(held, 'rev-parse', 'refs/stash').trim(), deletedStash)
      const combinedCall = calls.find(
        call => call.method === 'delete_branch' && call.upstream
      )
      assert.deepEqual(combinedCall.upstream, {
        fetch_backup: false,
        expected: null,
      })
      assert.equal(typeof combinedCall.basis, 'string')
      // Case-only native renames keep the selected worktree/index contents and
      // require a new review for each spelling. Published defaults stay protected.
      gitAt(
        held,
        'update-ref',
        'refs/remotes/origin/main',
        gitAt(held, 'rev-parse', 'refs/heads/main').trim()
      )
      gitAt(held, 'branch', '--set-upstream-to', 'origin/main', 'main')
      await until(
        () =>
          button(
            document.querySelector('.branch-rename'),
            'Review branch rename'
          ).disabled &&
          document
            .querySelector('.branch-rename')
            .textContent.includes(
              'The published default branch cannot be renamed'
            ),
        'published default rename was enabled'
      )
      gitAt(held, 'switch', '-qc', 'case-topic')
      await readyBranch('case-topic')
      const renamePanel = document.querySelector('.branch-rename'),
        caseIndex = gitAt(held, 'ls-files', '--stage'),
        caseWorking = await readFile(path.join(held, 'file.txt'), 'utf8')
      for (const next of ['CASE-TOPIC', 'case-topic']) {
        await until(
          () => !button(renamePanel, 'Review branch rename').disabled,
          'case rename controls were not ready'
        )
        const field = renamePanel.querySelector('input')
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          'value'
        ).set.call(field, next)
        field.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
        button(renamePanel, 'Review branch rename')
          .closest('form')
          .dispatchEvent(
            new dom.window.Event('submit', { bubbles: true, cancelable: true })
          )
        await until(
          () =>
            button(renamePanel, 'Confirm branch rename') &&
            !button(renamePanel, 'Confirm branch rename').disabled,
          () => `case review did not load: ${renamePanel.textContent}`
        )
        assert(
          renamePanel.textContent.includes(
            'changes only the branch name’s letter case'
          )
        )
        button(renamePanel, 'Confirm branch rename').click()
        await readyBranch(next)
        assert.equal(gitAt(held, 'ls-files', '--stage'), caseIndex)
        assert.equal(
          await readFile(path.join(held, 'file.txt'), 'utf8'),
          caseWorking
        )
      }
      assert.deepEqual(
        calls
          .filter(call => call.method === 'open_worktree')
          .map(call => call.path),
        [{ bytes: [...Buffer.from(held)] }]
      )
      assert(
        calls
          .filter(call => call.method === 'checkout')
          .every(call => typeof call.basis === 'string')
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
  }
)
