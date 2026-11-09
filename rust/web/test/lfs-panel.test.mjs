import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function until(check) {
  for (let n = 0; n < 200; ++n) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'LFS panel did not settle')
}

test('LFS inspection preserves raw paths, setup is explicit, errors and stale roots are handled', async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:9418',
  })
  globalThis.MessageChannel = undefined
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  const { mountLfs } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let changed = 0,
    fail = false,
    pending = null
  const value = {
    available: true,
    version: 'git-lfs/test',
    using_lfs: true,
    patterns: [
      {
        pattern: '*.bin',
        source: '.gitattributes',
        tracked: true,
        lockable: false,
      },
    ],
    files: [{ display_path: '<script>unsafe</script>', tracked: true }],
  }
  const view = mountLfs(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'lfs_status') {
        if (pending)
          return new Promise(resolve => {
            pending.resolve = resolve
          })
        return value
      }
      return {
        code: fail ? 2 : 0,
        stdout: 'initialized',
        stderr: 'existing hook preserved',
      }
    },
    async onChanged() {
      ++changed
    },
  })
  const button = text =>
    [...root.querySelectorAll('button')].find(item => item.textContent === text)
  const checkbox = text =>
    [...root.querySelectorAll('label')]
      .find(item => item.textContent.includes(text))
      .querySelector('input')
  const raw = { bytes: [255, 46, 98, 105, 110] }
  try {
    assert(!button('Inspect LFS').disabled)
    assert(button('Populate cached LFS files').disabled)
    assert.equal(calls.length, 0)
    button('Install LFS configuration').click()
    await until(() => changed === 1 && !button('Inspect LFS').disabled)
    assert.deepEqual(
      calls.find(call => call.method === 'lfs_install').parameters,
      {
        scope: 'global',
        force: false,
        skip_repo: true,
        skip_smudge: false,
        repository_id: null,
      }
    )
    calls.length = 0
    changed = 0

    view.setSnapshot({
      root: 'repo-a',
      files: [{ path: raw, display_path: 'raw.bin' }],
    })
    assert.equal(calls.length, 0)
    button('Inspect LFS').click()
    await until(() => root.textContent.includes('git-lfs/test'))
    assert.deepEqual(calls[0], {
      method: 'lfs_status',
      parameters: { paths: [raw], repository_id: 'repo-a' },
    })
    assert(root.textContent.includes('<script>unsafe</script>'))
    assert.equal(root.querySelector('script'), null)
    const set = (label, value) => {
      const element = root.querySelector(`[aria-label="${label}"]`)
      if (element.tagName === 'SELECT') {
        element.value = value
        element.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
        return
      }
      const prototype =
        element.tagName === 'TEXTAREA'
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(
        element,
        value
      )
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }
    const ready = () => until(() => !button('Inspect LFS').disabled)
    set('LFS remote', 'backup')
    set('LFS refs', 'main\nrelease')
    set('LFS include', '*.bin')
    set('LFS exclude', 'private/*')
    checkbox('Dry run').click()
    checkbox('Also fetch recent').click()
    checkbox('Refetch cached').click()
    button('Fetch LFS objects').click()
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'lfs_transfer').parameters,
      {
        request: {
          action: 'fetch',
          remote: 'backup',
          refs: ['main', 'release'],
          all: false,
          dry_run: true,
          include: '*.bin',
          exclude: 'private/*',
          recent: true,
          refetch: true,
        },
        repository_id: 'repo-a',
      }
    )
    set('LFS transfer action', 'push')
    button('Upload LFS objects').click()
    await ready()
    assert.deepEqual(
      calls.filter(call => call.method === 'lfs_transfer').at(-1).parameters,
      {
        request: {
          action: 'push',
          remote: 'backup',
          refs: ['main', 'release'],
          all: false,
          dry_run: true,
        },
        repository_id: 'repo-a',
      }
    )
    set('LFS transfer action', 'pull')
    button('Download and update LFS files').click()
    await ready()
    assert.deepEqual(
      calls.filter(call => call.method === 'lfs_transfer').at(-1).parameters,
      {
        request: {
          action: 'pull',
          remote: 'backup',
          include: '*.bin',
          exclude: 'private/*',
        },
        repository_id: 'repo-a',
      }
    )
    set('LFS checkout patterns', '*.bin\nassets/*')
    button('Populate cached LFS files').click()
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'lfs_checkout').parameters,
      { patterns: ['*.bin', 'assets/*'], repository_id: 'repo-a' }
    )
    set('LFS tracking patterns', '*.bin\nassets/*.psd')
    checkbox('Treat as literal').click()
    set('LFS lockable rule', 'true')
    button('Track LFS patterns').click()
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'lfs_track').parameters,
      {
        patterns: ['*.bin', 'assets/*.psd'],
        filename: true,
        lockable: true,
        repository_id: 'repo-a',
      }
    )
    button('Untrack LFS patterns').click()
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'lfs_untrack').parameters,
      { patterns: ['*.bin', 'assets/*.psd'], repository_id: 'repo-a' }
    )
    set('LFS tracking patterns', ' leading [1].bin ')
    button('Track LFS patterns').click()
    await ready()
    assert.deepEqual(
      calls.filter(call => call.method === 'lfs_track').at(-1).parameters
        .patterns,
      [' leading [1].bin ']
    )
    changed = 0

    assert(!calls.some(call => call.method === 'lfs_install'))
    button('Install LFS configuration').click()
    await until(() => changed === 1 && !button('Inspect LFS').disabled)
    assert.deepEqual(
      calls.find(call => call.method === 'lfs_install').parameters,
      {
        scope: 'local',
        force: false,
        skip_repo: false,
        skip_smudge: false,
        repository_id: 'repo-a',
      }
    )
    const select = root.querySelector('select')
    select.value = 'global'
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    checkbox('Skip repository').click()
    checkbox('Skip automatic').click()
    checkbox('Replace existing').click()
    fail = true
    button('Install LFS configuration').click()
    await until(() => root.textContent.includes('existing hook preserved'))
    assert.deepEqual(
      calls.filter(call => call.method === 'lfs_install').at(-1).parameters,
      {
        scope: 'global',
        force: true,
        skip_repo: true,
        skip_smudge: true,
        repository_id: 'repo-a',
      }
    )
    assert.equal(changed, 2)
    pending = {}
    button('Inspect LFS').click()
    await until(() => typeof pending.resolve === 'function')
    view.setSnapshot({ root: 'repo-b', files: [] })
    pending.resolve(value)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!root.textContent.includes('git-lfs/test'))
    assert.equal(root.querySelector('select').value, 'local')
    assert(!checkbox('Replace existing').checked)
    pending = null
    value.available = false
    value.version = null
    value.using_lfs = null
    value.patterns = []
    value.hint = 'Install git-lfs on PATH'
    button('Inspect LFS').click()
    await until(() => root.textContent.includes(value.hint))
  } finally {
    view.dispose()
    dom.window.close()
  }
})
