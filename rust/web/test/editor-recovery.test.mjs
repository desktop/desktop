import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function until(check) {
  for (let n = 0; n < 200; ++n) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'editor/recovery UI did not settle')
}
function setup(html) {
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:9418',
    pretendToBeVisual: true,
  })
  globalThis.MessageChannel = undefined
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  return dom
}
function button(root, text) {
  return [...root.querySelectorAll('button')].find(
    item => item.textContent === text
  )
}
function value(dom, element, next) {
  const prototype =
    element.tagName === 'TEXTAREA'
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, next)
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}

test('editor settings preserve argv, terminal choice, global preferences and stale-root guards', async () => {
  const dom = setup('<div id="root"></div>')
  const { mountManagement } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let pending = null,
    failLaunch = false
  const preferences = {
    version: 1,
    theme: 'system',
    poll_interval_ms: 2000,
    external_editor: { kind: 'automatic' },
  }
  const panel = mountManagement(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'available_editors') {
        if (pending)
          return new Promise(resolve => {
            pending.resolve = resolve
          })
        return {
          editors: [
            {
              name: '<script>Editor</script>',
              program: '/tools/editor app',
              terminal: false,
            },
          ],
        }
      }
      if (method === 'update_preferences')
        return { ...preferences, ...parameters.preferences }
      if (method === 'open_editor' && failLaunch)
        throw new Error('This editor needs an interactive terminal')
      return { code: 0 }
    },
    async onChanged() {},
    onPreferences(value) {
      panel.setPreferences(value)
    },
    async openWorktree() {},
  })
  panel.setPreferences(preferences)
  const editor = root.querySelector('.editor-settings')
  try {
    assert(button(editor, 'Open repository in editor').disabled)
    button(editor, 'Find installed editors').click()
    await until(() => button(editor, '<script>Editor</script>'))
    assert.equal(editor.querySelector('script'), null)
    button(editor, '<script>Editor</script>').click()
    assert.equal(
      editor.querySelector('[aria-label="Editor executable"]').value,
      '/tools/editor app'
    )
    value(
      dom,
      editor.querySelector('[aria-label="Editor executable"]'),
      'program with spaces'
    )
    value(
      dom,
      editor.querySelector('[aria-label="Editor arguments"]'),
      '--wait\n{path}\n--repo={repo}\n$(touch none)'
    )
    editor.querySelector('input[type=checkbox]').click()
    button(editor, 'Save editor preference')
      .closest('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
    await until(() => editor.textContent.includes('Editor preference saved'))
    assert.deepEqual(
      calls.find(call => call.method === 'update_preferences').parameters,
      {
        preferences: {
          external_editor: {
            kind: 'command',
            program: 'program with spaces',
            args: ['--wait', '{path}', '--repo={repo}', '$(touch none)'],
            terminal: true,
          },
        },
      }
    )
    assert(editor.textContent.includes('interactive terminal'))
    panel.setRepository('repo-a')
    failLaunch = true
    button(editor, 'Open repository in editor').click()
    await until(() =>
      editor
        .querySelector('[role=status]')
        .textContent.includes('interactive terminal')
    )
    assert.deepEqual(
      calls.find(call => call.method === 'open_editor').parameters,
      { path: null, repository_id: 'repo-a' }
    )
    pending = {}
    button(editor, 'Find installed editors').click()
    await until(() => pending.resolve)
    panel.setRepository('repo-b')
    pending.resolve({
      editors: [{ name: 'stale editor', program: 'stale', terminal: false }],
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!editor.textContent.includes('stale editor'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('manual conflict flow launches an editor and stages only reviewed contents with explicit marker consent', async () => {
  const dom = setup('<div id="root"></div>')
  const { mountRecovery } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let version = 'reviewed-v0',
    changed = 0,
    pending = null
  const path = { bytes: [102, 255] }
  const panel = mountRecovery(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'conflict_detail')
        return {
          basis: version,
          working: { kind: 'regular', size: 40 },
          stages: [
            { stage: 2, text: 'ours' },
            { stage: 3, text: 'theirs' },
          ],
        }
      if (method === 'open_editor') {
        version = 'edited-v1'
        return { code: 0 }
      }
      if (method === 'stage_conflict') {
        if (pending)
          return new Promise(resolve => {
            pending.resolve = resolve
          })
        if (parameters.basis !== version)
          throw new Error('Conflict or working file changed')
        return parameters.allow_markers
          ? { code: 0 }
          : { code: 2, requires_confirmation: true, markers: 3 }
      }
      return { code: 0 }
    },
    async onChanged() {
      ++changed
    },
  })
  const snapshot = {
    root: 'repo-a',
    branch: 'main',
    operation: { kind: 'merge', step: null, total: null },
    files: [{ path, display_path: 'file', conflicted: true }],
  }
  panel.setSnapshot(snapshot)
  try {
    button(root, 'Inspect conflict: file').click()
    await until(() => button(root, 'Open external editor'))
    button(root, 'Open external editor').click()
    await until(() => root.textContent.includes('Editor launched'))
    assert.deepEqual(
      calls.find(call => call.method === 'open_editor').parameters,
      { path }
    )
    button(root, 'Stage edited resolution').click()
    await until(() => root.textContent.includes('working file changed'))
    // Refresh repository/history after errors to expose interrupted receipts.
    assert.equal(changed, 1)
    button(root, 'Refresh edited preview').click()
    await until(() => !button(root, 'Stage edited resolution').disabled)
    button(root, 'Stage edited resolution').click()
    await until(() => button(root, 'Stage with detected conflict markers'))
    assert.equal(changed, 1)
    button(root, 'Stage with detected conflict markers').click()
    await until(() => root.textContent.includes('Edited resolution staged'))
    assert.equal(changed, 2)
    assert.deepEqual(
      calls.filter(call => call.method === 'stage_conflict').at(-1).parameters,
      { path, basis: 'edited-v1', allow_markers: true }
    )
    button(root, 'Inspect conflict: file').click()
    await until(() => button(root, 'Stage edited resolution'))
    const late = {}
    pending = late
    button(root, 'Stage edited resolution').click()
    await until(() => late.resolve)
    panel.setSnapshot({ ...snapshot, root: 'repo-b', files: [] })
    late.resolve({ code: 0 })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!root.textContent.includes('Edited resolution staged'))
    assert.equal(changed, 2)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('resolution undo is bound to its receipt and clears on root/operation changes', async () => {
  const dom = setup('<div id="root"></div>')
  const { mountRecovery } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  const snapshot = {
    root: 'repo-a',
    branch: 'main',
    operation: { kind: 'merge', step: null, total: null },
    files: [{ path: 'file', display_path: 'file', conflicted: true }],
  }
  let pending = null,
    changes = 0
  const panel = mountRecovery(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'conflict_detail')
        return {
          basis: 'review',
          working: { kind: 'regular', size: 12 },
          stages: [
            { stage: 2, text: 'ours' },
            { stage: 3, text: 'theirs' },
          ],
        }
      if (method === 'undo_discard' && pending)
        return new Promise(resolve => {
          pending.resolve = resolve
        })
      return { code: 0, undo_id: 'resolution-backup' }
    },
    async onChanged() {
      ++changes
    },
  })
  panel.setSnapshot(snapshot)
  try {
    button(root, 'Inspect conflict: file').click()
    await until(() => button(root, 'Use ours and stage'))
    button(root, 'Use ours and stage').click()
    await until(() => button(root, 'Undo last resolution'))
    button(root, 'Undo last resolution').click()
    await until(() => root.textContent.includes('Original conflict restored'))
    assert.deepEqual(
      calls.find(call => call.method === 'undo_discard').parameters,
      { undo_id: 'resolution-backup' }
    )
    assert(button(root, 'Stage edited resolution'))
    button(root, 'Stage edited resolution').click()
    await until(() => button(root, 'Unstage resolution (keep working files)'))
    panel.clearResolutionUndo()
    assert(!button(root, 'Unstage resolution (keep working files)'))
    button(root, 'Inspect conflict: file').click()
    await until(() => button(root, 'Use theirs and stage'))
    button(root, 'Use theirs and stage').click()
    await until(() => button(root, 'Undo last resolution'))
    pending = {}
    button(root, 'Undo last resolution').click()
    await until(() => pending.resolve)
    panel.setSnapshot({
      ...snapshot,
      root: 'repo-b',
      operation: null,
      files: [],
    })
    const before = changes
    pending.resolve({ code: 0 })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!root.textContent.includes('Original conflict restored'))
    assert(!button(root, 'Undo last resolution'))
    assert.equal(changes, before + 1)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
