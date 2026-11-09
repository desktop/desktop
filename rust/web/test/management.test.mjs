import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
async function waitFor(check) {
  for (let n = 0; n < 200; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(check(), 'DOM condition did not become true')
}

test('settings, worktrees, and submodules issue typed requests without forcing data loss', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
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
  const { mountManagement } = await import('../panels.js'),
    root = document.querySelector('#root'),
    calls = [],
    opened = [],
    preferences = []
  const tree = {
    path: { bytes: [47, 114, 101, 112, 111] },
    display_path: '/repo',
    head: 'a'.repeat(40),
    branch: 'refs/heads/topic',
    detached: false,
    locked: null,
    prunable: null,
    main: false,
    bare: false,
  }
  const module = {
    path: { bytes: [109] },
    display_path: 'module',
    initialized: true,
    changed: false,
    dirty: true,
  }
  let changes = 0
  const panel = mountManagement(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'get_preferences')
        return { version: 1, theme: 'dark', poll_interval_ms: 2000 }
      if (method === 'update_preferences')
        return { version: 1, ...parameters.preferences }
      if (method === 'git_settings')
        return { scope: parameters.scope, values: { 'user.name': 'Author' } }
      if (method === 'worktrees') return [tree]
      if (method === 'submodules') return [module]
      return { code: 0, stdout: '', stderr: '' }
    },
    async onChanged() {
      changes++
    },
    onPreferences(value) {
      preferences.push(value)
    },
    async openWorktree(path) {
      opened.push(path)
    },
  })
  function button(text) {
    const value = [...root.querySelectorAll('button')].find(
      button => button.textContent === text
    )
    assert.ok(value, text)
    return value
  }
  function field(label) {
    const value = [...root.querySelectorAll('label')].find(labelNode =>
      labelNode.textContent.startsWith(label)
    )
    assert.ok(value, label)
    return value.querySelector('input,select')
  }
  function input(label, value) {
    const element = field(label)
    if (element.tagName === 'SELECT') {
      element.value = value
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      return
    }
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value'
    ).set.call(element, value)
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  }
  function submit(text) {
    button(text)
      .closest('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
  }
  async function ready() {
    await waitFor(() => !button('Save preferences').disabled)
  }
  try {
    await waitFor(() => preferences.length === 1)
    panel.setRepository('root-key')
    await ready()
    input('Theme', 'light')
    input('Repository refresh interval', 1000)
    submit('Save preferences')
    await waitFor(() => preferences.at(-1).theme === 'light')
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'update_preferences').parameters,
      { preferences: { theme: 'light', poll_interval_ms: 1000 } }
    )
    button('Read Git settings').click()
    await waitFor(() => root.textContent.includes('Author'))
    await ready()
    input('Setting value', 'New Author')
    submit('Save Git setting')
    await waitFor(() => calls.some(call => call.method === 'set_git_setting'))
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'set_git_setting').parameters,
      { scope: 'local', key: 'user.name', value: 'New Author' }
    )
    button('Refresh worktrees').click()
    await waitFor(() => root.textContent.includes('Open worktree'))
    await ready()
    button('Open worktree').click()
    await waitFor(() => opened.length === 1)
    await ready()
    assert.deepEqual(opened[0], tree.path)
    button('Remove clean worktree').click()
    await waitFor(() => calls.some(call => call.method === 'worktree_remove'))
    await ready()
    assert.equal(
      calls.find(call => call.method === 'worktree_remove').parameters.force,
      false
    )
    input('New worktree directory', '/new')
    input('Worktree branch', 'feature')
    submit('Create worktree')
    await waitFor(() => calls.some(call => call.method === 'worktree_add'))
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'worktree_add').parameters,
      { path: '/new', branch: 'feature', new_branch: true }
    )
    input('Starting revision', 'main')
    field('Create a new branch').click()
    input('New worktree directory', '/existing')
    input('Worktree branch', 'main')
    submit('Create worktree')
    await waitFor(
      () => calls.filter(call => call.method === 'worktree_add').length === 2
    )
    await ready()
    assert.deepEqual(
      calls.filter(call => call.method === 'worktree_add').at(-1).parameters,
      { path: '/existing', branch: 'main', new_branch: false }
    )
    button('Refresh submodules').click()
    await waitFor(() =>
      root.textContent.includes('Deinitialize clean submodule')
    )
    await ready()
    button('Deinitialize clean submodule').click()
    await waitFor(() => calls.some(call => call.method === 'submodule_deinit'))
    await ready()
    assert.deepEqual(
      calls.find(call => call.method === 'submodule_deinit').parameters,
      { paths: [module.path], force: false }
    )
    assert.ok(changes >= 3)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('repository management exposes read-only publication review', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
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
  const { mountManagement } = await import('../panels.js'),
    root = document.querySelector('#root'),
    calls = []
  const panel = mountManagement(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'get_preferences')
        return { version: 1, theme: 'system', poll_interval_ms: 2000 }
      if (method === 'publish_context')
        return {
          host: 'github.com',
          name: 'example',
          description: '',
          private: true,
          accounts: [],
          assignment: { mode: 'effective' },
          origin_exists: false,
          status: 'available',
          reason: null,
        }
      if (method === 'publish_organizations')
        return {
          organizations: [],
          actor: { login: 'alice', id: 1 },
          status: 'available',
          reason: null,
        }
      if (method === 'publish_preview')
        return {
          basis: 'basis',
          can_apply: false,
          can_create: true,
          create_reason: 'Remote creation only',
          reason: 'Publishing is not implemented yet',
          actor: { login: 'alice', id: 1 },
          owner: { login: 'alice', id: 1, kind: 'personal' },
          pushes: [],
          push_status: 'unborn',
        }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
    onPreferences() {},
    async openWorktree() {},
  })
  const button = text =>
    [...root.querySelectorAll('button')].find(node => node.textContent === text)
  try {
    await waitFor(() => !button('Save preferences').disabled)
    assert(!root.querySelector('.publish-repository'))
    panel.setRepository('repo')
    assert(root.querySelector('.publish-repository'))
    assert(root.textContent.includes('Full publication is not available'))
    button('Load publishing options').click()
    await waitFor(
      () =>
        button('Review publication') && !button('Review publication').disabled
    )
    button('Review publication').click()
    await waitFor(() => root.querySelector('[aria-label="Publication review"]'))
    assert(root.textContent.includes('alice/example'))
    assert.deepEqual(
      calls.find(call => call.method === 'publish_preview').parameters.request,
      {
        host: 'github.com',
        target: { mode: 'effective' },
        owner: 'alice',
        name: 'example',
        description: '',
        private: true,
      }
    )
    assert(!button('Publish repository'))
    assert(button('Load publication history'))
    assert(
      !calls.some(call =>
        ['publish', 'publish_history', 'acknowledge_publish'].includes(
          call.method
        )
      )
    )
    panel.setRepository(null)
    assert(!root.querySelector('.publish-repository'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
