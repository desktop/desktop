import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function until(check) {
  for (let n = 0; n < 250; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'Repository account controls did not settle')
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup() {
  const dom = new JSDOM('<div id="root"></div>', {
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
    value => value.textContent === text
  )
}
function click(root, text) {
  const control = button(root, text)
  assert(control, 'Missing button ' + text)
  assert.equal(control.disabled, false, 'Disabled button ' + text)
  control.click()
}
function choose(dom, root, value) {
  const select = root.querySelector('select')
  assert.equal(select.disabled, false)
  select.value = typeof value === 'string' ? value : JSON.stringify(value)
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}
const repository = { host: 'github.com', owner: 'owner', name: 'project' }
const initial = {
  basis: 'account-a',
  scope_id: 'saved-repository',
  saved: true,
  revision: 0,
  assignment: { mode: 'effective' },
  scoped_metadata: false,
  repository,
  remote: 'origin',
}
const bob = { mode: 'assigned', host: 'github.com', login: 'Bob' }
const catalog = account => ({
  account,
  host: 'github.com',
  status: 'available',
  reason: null,
  accounts: ['Alice', 'Bob'].map(login => ({
    host: 'github.com',
    login,
    active: login === 'Alice',
    state: 'success',
    token_source: 'keyring',
    git_protocol: 'https',
  })),
})
const preview = (current, target) => ({
  basis: 'review-' + current.basis + '-' + target.mode,
  current,
  target,
  actor:
    target.mode === 'assigned'
      ? { host: target.host, login: target.login, id: 42 }
      : null,
  repository: target.mode === 'assigned' ? repository : null,
  can_apply: true,
  status:
    target.mode === 'assigned'
      ? 'verified'
      : target.mode === 'none'
      ? 'disabled'
      : 'unverified',
  reason: null,
})
async function mount(request, onChanged = async () => {}) {
  const { mountManagement } = await import('../panels.js')
  const container = document.querySelector('#root')
  const panel = mountManagement(container, {
    async request(method, parameters) {
      if (method === 'get_preferences')
        return { version: 1, theme: 'system', poll_interval_ms: 2000 }
      return request(method, parameters)
    },
    onChanged,
    onPreferences() {},
    async openWorktree() {},
  })
  await until(() => !button(container, 'Save preferences').disabled)
  panel.setRepository('/repo', initial.basis)
  return {
    panel,
    container,
    root: container.querySelector('.repository-account'),
  }
}
async function ready(root) {
  await until(() => !button(root, 'Load repository account').disabled)
}

test('account changes require explicit reviewed targets and preserve the returned assignment across snapshot refresh', async () => {
  const dom = setup(),
    calls = [],
    saving = deferred()
  let current = initial,
    changes = 0,
    panel
  const view = await mount(
    async (method, parameters) => {
      calls.push({ method, parameters })
      if (method === 'repository_account') return current
      if (method === 'repository_account_catalog') return catalog(current)
      if (method === 'repository_account_preview')
        return {
          ...preview(current, parameters.target),
          // An extended response must never become mutation parameters.
          verified: true,
        }
      if (method === 'set_repository_account') {
        await saving.promise
        current = {
          ...current,
          basis: 'saved-' + parameters.target.mode,
          revision: current.revision + 1,
          assignment:
            parameters.target.mode === 'assigned'
              ? { ...parameters.target, id: 42 }
              : parameters.target,
          scoped_metadata: parameters.target.mode === 'assigned',
          upstream_setup_error:
            'Existing upstream points to another repository',
        }
        return current
      }
      throw new Error('Unexpected method: ' + method)
    },
    async () => {
      changes++
      panel.setRepository('/repo', current.basis)
    }
  )
  panel = view.panel
  const { root, container } = view
  try {
    assert.deepEqual(calls, [])
    click(root, 'Load repository account')
    await until(() => root.querySelector('select'))
    assert.equal(root.querySelector('select').value, 'effective')
    click(root, 'Refresh available accounts')
    await until(() => root.textContent.includes('Alice'))
    assert.equal(root.querySelector('select').value, 'effective')
    choose(dom, root, ['github.com', 'bob'])
    click(root, 'Review repository account')
    await until(() => root.querySelector('article'))
    await ready(root)
    assert(root.textContent.includes('Verified account: github.com/Bob'))
    assert(root.textContent.includes('GitHub ID 42'))
    assert.equal(
      calls.filter(call => call.method === 'set_repository_account').length,
      0
    )
    click(root, 'Confirm repository account')
    assert(button(container, 'Save preferences').disabled)
    assert(button(root, 'Load repository account').disabled)
    assert.deepEqual(calls.at(-1), {
      method: 'set_repository_account',
      parameters: {
        target: bob,
        basis: 'review-account-a-assigned',
      },
    })
    saving.resolve()
    await until(() => root.textContent.includes('Repository account saved.'))
    await ready(root)
    assert.equal(changes, 1)
    assert(
      root.textContent.includes(
        'Current assignment: github.com/Bob (GitHub ID 42)'
      )
    )
    assert(root.textContent.includes('Parent upstream setup needs attention:'))
    assert.equal(root.querySelector('article'), null)
    choose(dom, root, 'none')
    click(root, 'Review repository account')
    await until(() => root.querySelector('article'))
    await ready(root)
    assert(root.textContent.includes('GitHub API operations will be disabled'))
    click(root, 'Confirm repository account')
    await until(() => changes === 2)
    await ready(root)
    assert(root.textContent.includes('Current assignment: No GitHub account'))
    assert.deepEqual(calls.at(-1), {
      method: 'set_repository_account',
      parameters: {
        target: { mode: 'none' },
        basis: 'review-saved-assigned-none',
      },
    })
    assert(
      calls.every(
        call =>
          call.method.startsWith('repository_account') ||
          call.method === 'set_repository_account'
      )
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('signed-out named assignments remain selected and unavailable or malformed reviews never permit saving', async () => {
  const dom = setup(),
    calls = []
  let current = {
      ...initial,
      assignment: { ...bob, id: 42 },
      scoped_metadata: true,
    },
    failCatalog = false,
    badReview = null
  const { panel, root } = await mount(async (method, parameters) => {
    calls.push({ method, parameters })
    if (method === 'repository_account') return current
    if (method === 'repository_account_catalog') {
      if (failCatalog) throw new Error('Credential catalog unavailable')
      return {
        ...catalog(current),
        status: 'unavailable',
        accounts: [],
        reason: 'Sign in again',
      }
    }
    if (method === 'repository_account_preview')
      return badReview
        ? {
            ...preview(current, parameters.target),
            ...badReview,
          }
        : {
            ...preview(current, parameters.target),
            actor: null,
            can_apply: false,
            status: 'unavailable',
            reason: 'Named credentials are unavailable',
          }
    throw new Error('Unexpected method: ' + method)
  })
  try {
    click(root, 'Load repository account')
    await until(() => root.querySelector('select'))
    assert.equal(root.querySelector('select').value, '["github.com","bob"]')
    assert(root.textContent.includes('(saved assignment)'))
    click(root, 'Refresh available accounts')
    await until(() => root.textContent.includes('Sign in again'))
    await ready(root)
    assert.equal(root.querySelector('select').value, '["github.com","bob"]')
    click(root, 'Review repository account')
    await until(() => root.querySelector('article'))
    await ready(root)
    assert(button(root, 'Confirm repository account').disabled)
    assert(root.textContent.includes('Named credentials are unavailable'))
    failCatalog = true
    click(root, 'Refresh available accounts')
    await until(() =>
      root.textContent.includes('Credential catalog unavailable')
    )
    await ready(root)
    assert(root.textContent.includes('Current assignment: github.com/Bob'))
    assert.equal(root.querySelector('article'), null)
    for (const malformed of [
      { actor: { host: 'github.com', login: 'Bob', id: 0 } },
      { actor: { host: 'github.com', login: 'Alice', id: 42 } },
      { repository: null },
      { repository: { ...repository, host: 'other.example' } },
    ]) {
      badReview = malformed
      click(root, 'Review repository account')
      await until(() =>
        root.textContent.includes('Invalid repository account review')
      )
      await ready(root)
      assert.equal(root.querySelector('article'), null)
    }
    current = { ...initial, saved: false, scope_id: null }
    click(root, 'Load repository account')
    await until(() =>
      root.textContent.includes('Save this repository before assigning')
    )
    assert(root.querySelector('select').disabled)
    assert(button(root, 'Review repository account').disabled)
    assert.equal(
      calls.filter(call => call.method === 'set_repository_account').length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('root and account basis changes invalidate reviews and late reads without releasing a newer request', async () => {
  const dom = setup(),
    calls = [],
    oldCatalog = deferred(),
    oldReview = deferred(),
    newRead = deferred()
  let reading = initial,
    slowCatalog = false,
    slowReview = false,
    slowRead = false
  const { panel, root } = await mount(async (method, parameters) => {
    calls.push({ method, parameters })
    if (method === 'repository_account')
      return slowRead ? newRead.promise : reading
    if (method === 'repository_account_catalog')
      return slowCatalog ? oldCatalog.promise : catalog(reading)
    if (method === 'repository_account_preview')
      return slowReview
        ? oldReview.promise
        : preview(reading, parameters.target)
    throw new Error('Unexpected method: ' + method)
  })
  try {
    click(root, 'Load repository account')
    await until(() => root.querySelector('select'))
    click(root, 'Review repository account')
    await until(() => root.querySelector('article'))
    await ready(root)
    panel.setRepository('/repo', 'account-b')
    assert.equal(root.querySelector('article'), null)
    assert.equal(root.querySelector('select'), null)
    reading = { ...initial, basis: 'account-b' }
    click(root, 'Load repository account')
    await until(() => root.querySelector('select'))
    slowCatalog = true
    click(root, 'Refresh available accounts')
    panel.setRepository('/other-repo', 'account-c')
    slowRead = true
    click(root, 'Load repository account')
    oldCatalog.resolve(catalog(initial))
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(button(root, 'Load repository account').disabled)
    assert.equal(root.querySelector('select'), null)
    reading = {
      ...initial,
      basis: 'account-c',
      scope_id: 'other-saved-repository',
    }
    newRead.resolve(reading)
    await until(() => root.querySelector('select'))
    await ready(root)
    slowReview = true
    click(root, 'Review repository account')
    panel.setRepository('/other-repo', 'account-d')
    oldReview.resolve(preview(reading, { mode: 'effective' }))
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(root.querySelector('article'), null)
    assert.equal(root.querySelector('select'), null)
    assert.equal(
      calls.filter(call => call.method === 'set_repository_account').length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('an uncertain account mutation refreshes state once without replay and cannot clear a newer root request', async () => {
  const dom = setup(),
    calls = [],
    saving = deferred(),
    loading = deferred()
  let changes = 0,
    slowRead = false
  const { panel, root } = await mount(
    async (method, parameters) => {
      calls.push({ method, parameters })
      if (method === 'repository_account')
        return slowRead ? loading.promise : initial
      if (method === 'repository_account_preview')
        return preview(initial, parameters.target)
      if (method === 'set_repository_account') return saving.promise
      throw new Error('Unexpected method: ' + method)
    },
    async () => {
      changes++
    }
  )
  try {
    click(root, 'Load repository account')
    await until(() => root.querySelector('select'))
    choose(dom, root, 'none')
    click(root, 'Review repository account')
    await until(() => root.querySelector('article'))
    await ready(root)
    click(root, 'Confirm repository account')
    panel.setRepository('/other-repo', 'different-account')
    slowRead = true
    click(root, 'Load repository account')
    saving.reject(new Error('Disconnected after account save'))
    await until(() => changes === 1)
    assert(button(root, 'Load repository account').disabled)
    assert.equal(root.querySelector('select'), null)
    loading.resolve({
      ...initial,
      basis: 'different-account',
      assignment: { mode: 'none' },
    })
    await until(() => root.querySelector('select'))
    await ready(root)
    assert.equal(root.querySelector('select').value, 'none')
    assert(!root.textContent.includes('Disconnected after account save'))
    assert.equal(
      calls.filter(call => call.method === 'set_repository_account').length,
      1
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
