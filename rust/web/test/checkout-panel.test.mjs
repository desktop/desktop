import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { nameRules } from './name-rules-fixture.mjs'
async function until(check) {
  for (let n = 0; n < 250; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'checkout UI did not settle')
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
    button => button.textContent === text
  )
}
function input(root, text) {
  return [...root.querySelectorAll('label')]
    .find(label => label.textContent.includes(text))
    .querySelector('input')
}
const LEAVE = 'StashOnCurrentBranch',
  BRING = 'MoveToNewBranch',
  ASK = 'AskForConfirmation',
  oid = 'a'.repeat(40)
const review = {
  basis: 'review-a',
  target: { request: 'other', branch: 'other', remote: false },
  source_branch: 'main',
  dirty: true,
  can_leave: true,
  same_branch: false,
  conflicted: false,
  operation: null,
  files: [{ display_path: '<script>file</script>' }],
  source_stash: { oid, message: 'existing stash' },
  target_stash: { oid, message: 'destination work' },
  occupied_worktree: null,
}
function receipt(phase = 'switching', error = 'native switch failed') {
  return {
    receipt: {
      id: 'receipt-id',
      phase,
      target: { branch: 'other' },
      saved_oid: oid,
      error,
    },
    saved_stashes: [{ oid, message: 'tagged saved work' }],
  }
}
function prefs(strategy) {
  return {
    version: 1,
    theme: 'system',
    poll_interval_ms: 2000,
    uncommitted_changes: strategy,
  }
}

test('checkout review uses shared leave/bring values, replacement consent, saved index and preferences', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js'),
    root = document.querySelector('#root'),
    calls = [],
    busy = [],
    preferences = []
  let changed = 0,
    records = [],
    shown = 0,
    panel
  panel = mountCheckout(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'checkout_history') return records
      if (method === 'checkout_preview') return review
      if (method === 'update_preferences')
        return prefs(parameters.preferences.uncommitted_changes)
      if (method === 'checkout') {
        records = [receipt('complete', null)]
        return { code: 0 }
      }
      if (method === 'acknowledge_checkout') {
        records = []
        return { code: 0 }
      }
      throw new Error(method)
    },
    async onChanged() {
      changed++
      panel.setSnapshot({ root: 'repo-a', branch: 'other' })
    },
    onBusy(value) {
      busy.push(value)
    },
    onPreferences(value) {
      preferences.push(value)
    },
    onStashes() {
      shown++
    },
    async openWorktree() {
      assert.fail('unexpected worktree selection')
    },
  })
  panel.setSnapshot({ root: 'repo-a', branch: 'main' })
  // Mounting or changing roots must not release another component's busy state.
  assert.deepEqual(busy, [])
  panel.review('other')
  try {
    await until(() => button(root, 'Switch branch'))
    assert(button(root, 'Switch branch').disabled)
    assert.equal(root.querySelector('script'), null)
    assert(root.textContent.includes('destination has saved changes'))
    input(root, 'Replace my previous saved stash').click()
    assert(!button(root, 'Switch branch').disabled)
    input(root, 'Bring my changes').click()
    input(root, 'Restore the saved index').click()
    input(root, 'Remember this choice').click()
    button(root, 'Switch branch').click()
    await until(() => root.textContent.includes('Branch switched'))
    assert.equal(changed, 1)
    assert.deepEqual(
      calls.find(call => call.method === 'checkout').parameters,
      {
        branch: 'other',
        strategy: BRING,
        basis: 'review-a',
        replace_stash: false,
        restore_index: true,
      }
    )
    assert.equal(preferences[0].uncommitted_changes, BRING)
    assert(busy.includes(true) && busy.at(-1) === false)
    input(root, 'Show completed switches').click()
    await until(() => button(root, 'Acknowledge switch record'))
    button(root, 'Show saved stashes').click()
    assert.equal(shown, 1)
    button(root, 'Acknowledge switch record').click()
    await until(() => !button(root, 'Acknowledge switch record'))
    assert.deepEqual(
      calls.find(call => call.method === 'acknowledge_checkout').parameters,
      { receipt_id: 'receipt-id' }
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('failed checkout exposes receipt and saved stash; refreshing a review stays read-only', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js'),
    root = document.querySelector('#root'),
    calls = []
  let records = [],
    changed = 0,
    fail = true
  const panel = mountCheckout(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'checkout_history') return records
      if (method === 'checkout_preview')
        return { ...review, source_stash: null }
      if (method === 'checkout') {
        if (fail) {
          records = [receipt()]
          throw new Error('Checkout receipt-id stopped during switching')
        }
        return { code: 0 }
      }
      throw new Error(method)
    },
    async onChanged() {
      changed++
    },
    onBusy() {},
    onPreferences() {},
    onStashes() {},
    async openWorktree() {},
  })
  panel.setSnapshot({ root: 'repo-a', branch: 'main' })
  panel.review('other')
  try {
    await until(() => button(root, 'Switch branch'))
    button(root, 'Switch branch').click()
    await until(() => root.textContent.includes('stopped during switching'))
    assert.equal(changed, 1)
    assert(root.textContent.includes('Saved stash: ' + oid))
    assert(root.textContent.includes('other: switching'))
    panel.setStrategy(BRING)
    const previews = calls.filter(
      call => call.method === 'checkout_preview'
    ).length
    const histories = calls.filter(
      call => call.method === 'checkout_history'
    ).length
    panel.refreshHistory()
    await until(
      () =>
        calls.filter(call => call.method === 'checkout_history').length >
        histories
    )
    assert.equal(
      calls.filter(call => call.method === 'checkout_preview').length,
      previews
    )
    button(root, 'Refresh branch switch review').click()
    await until(
      () =>
        button(root, 'Switch branch') && !button(root, 'Switch branch').disabled
    )
    assert.equal(calls.filter(call => call.method === 'checkout').length, 1)
    panel.setEnabled(false)
    assert(button(root, 'Switch branch').disabled)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('existing worktrees open without stashing; stale registrations require an explicit action', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js'),
    root = document.querySelector('#root'),
    calls = [],
    opened = []
  const path = { bytes: [47, 116, 109, 112, 47, 255] },
    worktree = { path, display_path: 'other tree', prunable: null }
  let stale = false,
    removed = false
  const panel = mountCheckout(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'checkout_history') return []
      if (method === 'checkout_preview')
        return {
          ...review,
          source_stash: null,
          occupied_worktree: removed
            ? null
            : { ...worktree, prunable: stale ? 'missing directory' : null },
        }
      if (method === 'worktree_remove') {
        removed = true
        return { code: 0 }
      }
      throw new Error(method)
    },
    async onChanged() {},
    onBusy() {},
    onPreferences() {},
    onStashes() {},
    async openWorktree(path) {
      opened.push(path)
    },
  })
  panel.setSnapshot({ root: 'repo-a', branch: 'main' })
  panel.review('other')
  try {
    await until(() => opened.length === 1)
    assert.deepEqual(opened[0], path)
    assert(!calls.some(call => call.method === 'checkout'))
    stale = true
    panel.review('other')
    await until(() => button(root, 'Remove stale worktree registration…'))
    button(root, 'Remove stale worktree registration…').click()
    assert(!calls.some(call => call.method === 'worktree_remove'))
    button(root, 'Remove registered worktree').click()
    await until(() => button(root, 'Switch branch'))
    assert.deepEqual(
      calls.find(call => call.method === 'worktree_remove').parameters,
      { path, force: false }
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('late reviews cannot replace another root, and remembered strategies can be reset to ask', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js'),
    root = document.querySelector('#root'),
    preferences = []
  let resolve
  const panel = mountCheckout(root, {
    async request(method, parameters) {
      if (method === 'checkout_history') return []
      if (method === 'checkout_preview')
        return new Promise(value => {
          resolve = value
        })
      if (method === 'update_preferences')
        return prefs(parameters.preferences.uncommitted_changes)
      throw new Error(method)
    },
    async onChanged() {},
    onBusy() {},
    onPreferences(value) {
      preferences.push(value)
    },
    onStashes() {},
    async openWorktree() {},
  })
  panel.setSnapshot({ root: 'repo-a', branch: 'main' })
  panel.review('other')
  try {
    await until(() => resolve)
    panel.setSnapshot({ root: 'repo-b', branch: 'new' })
    resolve(review)
    await new Promise(resolve => setTimeout(resolve, 15))
    assert(!root.textContent.includes('Switch to other'))
    panel.setStrategy(LEAVE)
    await until(() => root.querySelector('select').value === LEAVE)
    const select = root.querySelector('select')
    select.value = ASK
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
    button(root, 'Save branch switch preference').click()
    await until(() =>
      root.textContent.includes('Branch switch preference saved')
    )
    assert.equal(preferences[0].uncommitted_changes, ASK)
    panel.setSnapshot(null)
    assert.equal(root.textContent, '')
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('branch creation always reviews start/tracking options and shares leave/bring without leaking response metadata', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let changed = 0
  const panel = mountCheckout(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'checkout_history') return []
      if (method === 'create_branch_preview')
        return {
          ...review,
          target: {
            request: parameters.name,
            branch: parameters.name,
            remote: false,
            creation: {
              start_point: parameters.start_point,
              no_track: parameters.no_track,
              checkout: parameters.checkout,
              start_ref: 'refs/remotes/origin/topic',
              start_oid: oid,
            },
          },
          source_stash: null,
          target_stash: null,
          dirty: parameters.checkout,
        }
      return { code: 0 }
    },
    async onChanged() {
      changed++
    },
    onBusy() {},
    onPreferences() {},
    onStashes() {},
    async openWorktree() {},
  })
  try {
    panel.setSnapshot({ root: '/repo', branch: 'main' })
    panel.setStrategy(BRING)
    panel.create('new-topic', {
      start_point: 'refs/remotes/origin/topic',
      no_track: true,
      checkout: true,
    })
    await until(() => button(root, 'Create and switch branch'))
    assert.equal(
      calls.filter(call => call.method === 'create_branch').length,
      0
    )
    assert(root.textContent.includes('Do not configure upstream tracking'))
    button(root, 'Refresh branch switch review').click()
    await until(
      () =>
        calls.filter(call => call.method === 'create_branch_preview').length ===
          2 && !button(root, 'Create and switch branch').disabled
    )
    for (const call of calls.filter(
      call => call.method === 'create_branch_preview'
    ))
      assert.deepEqual(call.parameters, {
        name: 'new-topic',
        start_point: 'refs/remotes/origin/topic',
        no_track: true,
        checkout: true,
      })
    input(root, 'Leave my changes on main').click()
    button(root, 'Create and switch branch').click()
    await until(
      () =>
        changed === 1 &&
        root.textContent.includes('Branch created and switched')
    )
    assert.deepEqual(
      calls.find(call => call.method === 'create_branch').parameters,
      {
        name: 'new-topic',
        start_point: 'refs/remotes/origin/topic',
        no_track: true,
        checkout: true,
        strategy: LEAVE,
        basis: 'review-a',
        replace_stash: false,
        restore_index: false,
      }
    )
    panel.create('ref-only', {
      start_point: null,
      no_track: false,
      checkout: false,
    })
    await until(() => button(root, 'Create branch'))
    assert(
      root.textContent.includes(
        'Working files, staging and the current branch remain in place'
      )
    )
    assert.equal([...root.querySelectorAll('input[type=radio]')].length, 0)
    button(root, 'Create branch').click()
    await until(() => changed === 2)
    assert.equal(
      calls.filter(call => call.method === 'create_branch')[1].parameters
        .checkout,
      false
    )
    assert.equal(
      calls.some(call => call.method === 'checkout'),
      false
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('creation failures retain phase records and late reviews cannot cross repository roots', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let records = [],
    pending,
    slow = false
  const panel = mountCheckout(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'checkout_history') return records
      if (method === 'create_branch_preview') {
        const value = {
          ...review,
          source_stash: null,
          target: {
            request: parameters.name,
            branch: parameters.name,
            remote: false,
            creation: { start_point: null, no_track: false, checkout: true },
          },
        }
        if (slow)
          return new Promise(resolve => {
            pending = () => resolve(value)
          })
        return value
      }
      if (method === 'create_branch') {
        records = [receipt('creating_branch', 'native create partly completed')]
        throw new Error('Inspect the created branch before retrying')
      }
      return { code: 0 }
    },
    async onChanged() {},
    onBusy() {},
    onPreferences() {},
    onStashes() {},
    async openWorktree() {},
  })
  try {
    panel.setSnapshot({ root: '/repo', branch: 'main' })
    panel.create('new', { start_point: null, no_track: false, checkout: true })
    await until(() => button(root, 'Create and switch branch'))
    button(root, 'Create and switch branch').click()
    await until(() =>
      root.textContent.includes('Inspect the created branch before retrying')
    )
    assert(
      root.textContent.includes('creating_branch') &&
        root.textContent.includes('native create partly completed')
    )
    slow = true
    panel.create('late', { start_point: null, no_track: false, checkout: true })
    await until(() => pending)
    panel.setSnapshot({ root: '/other', branch: 'other' })
    pending()
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.equal(button(root, 'Create and switch branch'), undefined)
    assert.equal(
      calls.filter(call => call.method === 'create_branch').length,
      1
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('a creation review requested while busy opens once when ready without replaying an operation', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let panel
  panel = mountCheckout(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'checkout_history') return []
      if (method === 'create_branch_preview')
        return {
          ...review,
          dirty: false,
          source_stash: null,
          target_stash: null,
          target: {
            request: 'queued',
            branch: 'queued',
            remote: false,
            creation: { start_point: null, no_track: false, checkout: true },
          },
        }
      return { code: 0 }
    },
    async onChanged() {},
    onBusy(value) {
      panel.setEnabled(!value)
    },
    onPreferences() {},
    onStashes() {},
    async openWorktree() {},
  })
  try {
    panel.setSnapshot({ root: '/repo', branch: 'main' })
    panel.setEnabled(false)
    panel.create('queued', {
      start_point: null,
      no_track: false,
      checkout: true,
    })
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.equal(
      calls.filter(call => call.method === 'create_branch_preview').length,
      0
    )
    panel.setEnabled(true)
    await until(
      () =>
        button(root, 'Create and switch branch') &&
        !button(root, 'Create and switch branch').disabled
    )
    panel.setEnabled(false)
    panel.setEnabled(true)
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.equal(
      calls.filter(call => call.method === 'create_branch_preview').length,
      1
    )
    assert.equal(
      calls.filter(call => ['checkout', 'create_branch'].includes(call.method))
        .length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('creation rules block restricted names, disclose bypass and uncertainty, validate optional policy and keep mutation parameters whitelisted', async () => {
  const dom = setup(),
    { mountCheckout } = await import('../panels.js'),
    root = document.querySelector('#root'),
    calls = []
  let fields = {
      result: 'blocked',
      creation_restricted: 'enforced',
      reason: '<img src=x onerror=alert(1)> restricted',
      failed: [
        { ruleset_id: 2, description: '<script>restricted pattern</script>' },
      ],
    },
    changed = 0,
    nested
  const panel = mountCheckout(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'checkout_history') return []
      if (method === 'create_branch_preview') {
        const policy = nameRules(parameters.name, fields)
        return {
          ...review,
          basis: 'creation-review',
          dirty: false,
          files: [],
          source_stash: null,
          target_stash: null,
          name_rules: policy,
          target: {
            request: parameters.name,
            branch: parameters.name,
            remote: false,
            creation: {
              start_point: parameters.start_point,
              no_track: parameters.no_track,
              checkout: parameters.checkout,
              name_rules: nested ?? policy,
            },
          },
        }
      }
      if (method === 'create_branch') return { code: 0 }
      throw new Error(method)
    },
    async onChanged() {
      changed++
    },
    onBusy() {},
    onPreferences() {},
    onStashes() {},
    async openWorktree() {},
  })
  const options = { start_point: null, no_track: false, checkout: false }
  try {
    panel.setSnapshot({ root: '/repo', branch: 'main' })
    panel.setStrategy(BRING)
    panel.create('restricted', {
      ...options,
      name_rules: nameRules('restricted'),
      allowed: true,
    })
    await until(() => button(root, 'Create branch'))
    assert(button(root, 'Create branch').disabled)
    assert(
      root.textContent.includes(
        'GitHub repository rules restrict this branch name'
      )
    )
    assert(root.textContent.includes('<img src=x onerror=alert(1)> restricted'))
    assert.equal(root.querySelector('img'), null)
    assert.equal(root.querySelector('script'), null)
    button(root, 'Create branch').click()
    assert(
      !calls.some(call =>
        ['create_branch', 'update_preferences'].includes(call.method)
      )
    )
    assert.deepEqual(
      calls.find(call => call.method === 'create_branch_preview').parameters,
      { name: 'restricted', ...options }
    )
    fields = {
      status: 'unavailable',
      result: 'blocked',
      reason: 'Cannot evaluate a configured rule',
    }
    button(root, 'Refresh branch switch review').click()
    await until(() =>
      root.textContent.includes('Cannot evaluate a configured rule')
    )
    assert(button(root, 'Create branch').disabled)
    assert(root.textContent.includes('rules could not be checked'))
    fields = {
      result: 'warning',
      reason: 'Account can bypass this rule',
      bypassed: [{ ruleset_id: 2, description: 'must start with feature/' }],
    }
    button(root, 'Refresh branch switch review').click()
    await until(
      () =>
        button(root, 'Create branch') && !button(root, 'Create branch').disabled
    )
    assert(root.textContent.includes('your account can bypass'))
    assert(root.textContent.includes('must start with feature/'))
    button(root, 'Create branch').click()
    await until(
      () => changed === 1 && root.textContent.includes('Branch created')
    )
    assert.deepEqual(
      calls.find(call => call.method === 'create_branch').parameters,
      {
        name: 'restricted',
        ...options,
        strategy: BRING,
        basis: 'creation-review',
        replace_stash: false,
        restore_index: false,
      }
    )
    fields = {
      status: 'unavailable',
      result: 'not_checked',
      reason: 'GitHub is unavailable',
    }
    panel.create('uncertain', options)
    await until(
      () =>
        button(root, 'Create branch') && !button(root, 'Create branch').disabled
    )
    assert(root.textContent.includes('rules could not be checked'))
    assert(!root.textContent.includes('passes the applicable GitHub rules'))
    fields = {
      status: 'unavailable',
      result: 'pass',
      reason: 'Some rulesets were unavailable',
    }
    panel.create('partial', options)
    await until(
      () =>
        root.textContent.includes('Some rulesets were unavailable') &&
        button(root, 'Create branch') &&
        !button(root, 'Create branch').disabled
    )
    assert(root.textContent.includes('rules could not be checked'))
    assert(!root.textContent.includes('passes the applicable GitHub rules'))
    panel.setSnapshot({ root: '/other', branch: 'topic' })
    assert.equal(button(root, 'Create branch'), undefined)
    fields = {
      status: 'skipped',
      result: 'not_checked',
      reason: 'No associated GitHub repository',
    }
    panel.create('local', options)
    await until(
      () =>
        button(root, 'Create branch') && !button(root, 'Create branch').disabled
    )
    assert(root.textContent.includes('rules were not checked'))
    const malformed = [
      { result: ['blocked'] },
      { actor: { id: 'invalid', login: 'account' } },
      { branch: 'different' },
      { result: 'unsupported' },
    ]
    for (const [index, invalid] of malformed.entries()) {
      fields = invalid
      panel.create('invalid-' + index, options)
      await until(
        () =>
          calls.some(
            call =>
              call.method === 'create_branch_preview' &&
              call.parameters.name === 'invalid-' + index
          ) && root.textContent.includes('Invalid branch switch review')
      )
      assert.equal(button(root, 'Create branch'), undefined)
    }
    fields = {}
    nested = nameRules('mismatched', { result: 'blocked' })
    panel.create('mismatched', options)
    await until(
      () =>
        calls.some(
          call =>
            call.method === 'create_branch_preview' &&
            call.parameters.name === 'mismatched'
        ) && root.textContent.includes('Invalid branch switch review')
    )
    assert.equal(button(root, 'Create branch'), undefined)
    assert.equal(
      calls.filter(call => call.method === 'create_branch').length,
      1
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
