import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function until(check) {
  for (let n = 0; n < 250; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'Repository contribution settings did not settle')
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
function choose(dom, root, value) {
  const select = root.querySelector('select')
  select.value = value
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}
function submit(dom, root) {
  button(root, 'Save contribution target')
    .closest('form')
    .dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true })
    )
}
const cached = {
  basis: 'initial-review',
  fork_contribution_target: 'parent',
  status: 'unverified',
  remote: 'origin',
  repository: null,
}
const verified = {
  ...cached,
  basis: 'verified-review',
  status: 'verified',
  repository: {
    identity: { host: 'github.com', owner: 'person', name: '<img src=x>' },
    is_fork: true,
    parent: { host: 'github.com', owner: 'upstream-owner', name: 'project' },
    updated_at_secs: 1794000000,
  },
  contribution_remote: 'upstream',
  upstream_status: 'matches_parent',
}
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
  panel.setRepository('/repo')
  return {
    panel,
    container,
    root: container.querySelector('.repository-context'),
  }
}

test('contribution settings load offline, save only reviewed target/basis, share busy state and retain the preference across metadata refresh', async () => {
  const dom = setup(),
    calls = [],
    saving = deferred()
  let changes = 0,
    current = cached
  const { panel, container, root } = await mount(
    async (method, parameters) => {
      calls.push({ method, parameters })
      if (method === 'repository_context') return current
      if (method === 'set_fork_contribution_target') {
        await saving.promise
        current = {
          ...cached,
          basis: 'saved-review',
          fork_contribution_target: parameters.target,
        }
        return current
      }
      if (method === 'refresh_repository_context') {
        current = {
          ...verified,
          fork_contribution_target: current.fork_contribution_target,
          contribution_remote: 'origin',
        }
        return current
      }
      throw new Error('Unexpected request: ' + method)
    },
    async () => {
      changes++
    }
  )
  try {
    assert.deepEqual(calls, [])
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    assert.equal(root.querySelector('select').value, 'parent')
    assert(root.textContent.includes('has not been verified'))
    assert(button(root, 'Save contribution target').disabled)
    assert.equal(changes, 0)
    choose(dom, root, 'self')
    submit(dom, root)
    assert(button(container, 'Save preferences').disabled)
    assert(button(root, 'Load contribution settings').disabled)
    button(root, 'Refresh GitHub repository metadata').click()
    assert.deepEqual(calls, [
      { method: 'repository_context', parameters: {} },
      {
        method: 'set_fork_contribution_target',
        parameters: { target: 'self', basis: 'initial-review' },
      },
    ])
    saving.resolve()
    await until(
      () =>
        root.textContent.includes('Contribution target saved.') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert.equal(root.querySelector('select').value, 'self')
    assert.equal(changes, 1)
    button(root, 'Refresh GitHub repository metadata').click()
    await until(
      () =>
        root.textContent.includes('GitHub repository metadata refreshed.') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert.equal(root.querySelector('select').value, 'self')
    assert(
      root.textContent.includes(
        'Contributions target this fork through its fetch remote'
      )
    )
    assert(root.textContent.includes('github.com/person/<img src=x>'))
    assert(
      root.textContent.includes(
        'Parent repository: github.com/upstream-owner/project'
      )
    )
    assert.equal(root.querySelector('img'), null)
    assert.equal(changes, 2)
    assert.deepEqual(calls.at(-1), {
      method: 'refresh_repository_context',
      parameters: {},
    })
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('uncertain failures refresh repository state without replay and stale/unrecognized metadata remains explicit', async () => {
  const dom = setup(),
    calls = []
  let changes = 0,
    current = {
      ...verified,
      status: 'stale',
      fork_contribution_target: 'self',
      upstream_status: 'mismatch',
    }
  const { panel, root } = await mount(
    async (method, parameters) => {
      calls.push({ method, parameters })
      if (method === 'repository_context') return current
      if (method === 'refresh_repository_context')
        throw new Error('Metadata refresh disconnected')
      if (method === 'set_fork_contribution_target') {
        current = {
          ...cached,
          basis: 'saved-after-disconnect',
          status: 'unrecognized_remote',
        }
        throw new Error('Save disconnected after publication')
      }
      throw new Error('Unexpected request: ' + method)
    },
    async () => {
      changes++
    }
  )
  try {
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    assert(root.textContent.includes('metadata is stale'))
    assert(
      root.textContent.includes('Upstream points to a different repository')
    )
    assert(!root.textContent.includes('Contributions target this fork'))
    button(root, 'Refresh GitHub repository metadata').click()
    await until(
      () =>
        root.textContent.includes('Metadata refresh disconnected') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert.equal(changes, 1)
    assert.equal(root.querySelector('select'), null)
    assert.equal(
      calls.filter(call => call.method === 'refresh_repository_context').length,
      1
    )
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    choose(dom, root, 'parent')
    submit(dom, root)
    await until(
      () =>
        root.textContent.includes('Save disconnected after publication') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert.equal(changes, 2)
    assert.equal(root.querySelector('select'), null)
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    assert(root.textContent.includes('not recognized as a GitHub repository'))
    assert.equal(root.querySelector('select').value, 'parent')
    assert.equal(
      calls.filter(call => call.method === 'set_fork_contribution_target')
        .length,
      1
    )
    assert.deepEqual(
      calls.find(call => call.method === 'set_fork_contribution_target')
        .parameters,
      { target: 'parent', basis: 'verified-review' }
    )
    current = { ...verified, status: ['verified'] }
    button(root, 'Load contribution settings').click()
    await until(() =>
      root.textContent.includes(
        'Invalid repository contribution settings response'
      )
    )
    assert.equal(root.querySelector('select'), null)
    current = { ...verified, repository: null }
    button(root, 'Load contribution settings').click()
    await until(
      () =>
        root.textContent.includes(
          'Invalid repository contribution settings response'
        ) && !button(root, 'Load contribution settings').disabled
    )
    assert.equal(root.querySelector('select'), null)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('late reads and uncertain mutations cannot replace another repository or release its busy operation', async () => {
  const dom = setup(),
    oldRead = deferred(),
    nextRead = deferred(),
    saving = deferred(),
    newestRead = deferred(),
    calls = []
  let reads = 0,
    changes = 0
  const { panel, container, root } = await mount(
    async (method, parameters) => {
      calls.push({ method, parameters })
      if (method === 'repository_context') {
        reads++
        return (reads === 1 ? oldRead : reads === 2 ? nextRead : newestRead)
          .promise
      }
      if (method === 'set_fork_contribution_target') return saving.promise
      throw new Error('Unexpected request: ' + method)
    },
    async () => {
      changes++
    }
  )
  try {
    button(root, 'Load contribution settings').click()
    panel.setRepository('/next')
    button(root, 'Load contribution settings').click()
    oldRead.resolve({ ...verified, basis: 'old-repository' })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(root.querySelector('select'), null)
    assert(button(container, 'Save preferences').disabled)
    nextRead.resolve({ ...cached, basis: 'next-repository' })
    await until(
      () =>
        root.querySelector('select') &&
        !button(root, 'Load contribution settings').disabled
    )
    choose(dom, root, 'self')
    submit(dom, root)
    panel.setRepository('/newest')
    button(root, 'Load contribution settings').click()
    saving.resolve({ ...verified, fork_contribution_target: 'self' })
    await until(() => changes === 1)
    assert.equal(root.querySelector('select'), null)
    assert(button(container, 'Save preferences').disabled)
    newestRead.resolve({
      ...cached,
      basis: 'newest-repository',
      remote: 'newest-origin',
    })
    await until(
      () =>
        root.querySelector('select') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert.equal(root.querySelector('select').value, 'parent')
    assert(root.textContent.includes('Fetch remote: newest-origin'))
    assert(!root.textContent.includes('github.com/person'))
    assert.deepEqual(
      calls.filter(call => call.method === 'set_fork_contribution_target'),
      [
        {
          method: 'set_fork_contribution_target',
          parameters: { target: 'self', basis: 'next-repository' },
        },
      ]
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

const upstreamReview = {
  basis: 'upstream-review',
  status: 'add',
  remote: 'upstream',
  url: 'https://github.com/upstream-owner/project.git',
  parent: verified.repository.parent,
  reason: null,
}

test('parent upstream setup requires a fresh review, sends only its basis and reloads the returned context without replay', async () => {
  const dom = setup(),
    calls = [],
    executing = deferred()
  let changes = 0,
    current = {
      ...verified,
      upstream_status: 'missing',
      upstream_setup_error: 'Automatic setup failed\nReview and retry.',
    }
  const { panel, root } = await mount(
    async (method, parameters) => {
      calls.push({ method, parameters })
      if (method === 'repository_context') return current
      if (method === 'upstream_setup_preview') return upstreamReview
      if (method === 'setup_upstream') {
        await executing.promise
        current = {
          ...verified,
          basis: 'after-upstream',
          upstream_setup_error: null,
        }
        return { code: 0, status: 'added', context: current }
      }
      throw new Error('Unexpected request: ' + method)
    },
    async () => {
      changes++
    }
  )
  try {
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    assert(
      root.textContent.includes(
        'Upstream setup needs attention: Automatic setup failed'
      )
    )
    button(root, 'Review parent upstream setup').click()
    await until(
      () =>
        button(root, 'Confirm parent upstream setup') &&
        !button(root, 'Confirm parent upstream setup').disabled
    )
    assert(root.textContent.includes(upstreamReview.url))
    assert.deepEqual(calls.at(-1), {
      method: 'upstream_setup_preview',
      parameters: {},
    })
    assert.equal(changes, 0)
    assert.equal(
      calls.filter(call => call.method === 'setup_upstream').length,
      0
    )
    choose(dom, root, 'self')
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    choose(dom, root, 'parent')
    button(root, 'Review parent upstream setup').click()
    await until(
      () =>
        button(root, 'Confirm parent upstream setup') &&
        !button(root, 'Confirm parent upstream setup').disabled
    )
    button(root, 'Confirm parent upstream setup').click()
    assert(button(root, 'Load contribution settings').disabled)
    executing.resolve()
    await until(
      () =>
        root.textContent.includes('Parent upstream configured.') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert(root.textContent.includes('Upstream matches the parent repository'))
    assert(!root.textContent.includes('Automatic setup failed'))
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    assert.equal(changes, 1)
    assert.deepEqual(
      calls.find(call => call.method === 'setup_upstream'),
      { method: 'setup_upstream', parameters: { basis: 'upstream-review' } }
    )
    button(root, 'Review parent upstream setup').click()
    await until(
      () =>
        button(root, 'Confirm parent upstream setup') &&
        !button(root, 'Confirm parent upstream setup').disabled
    )
    current = { ...current, basis: 'context-changed' }
    button(root, 'Load contribution settings').click()
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    await until(
      () =>
        root.querySelector('select') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert.equal(
      calls.filter(call => call.method === 'setup_upstream').length,
      1
    )
    assert.equal(
      calls.some(call => ['fetch', 'push'].includes(call.method)),
      false
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('parent upstream conflicts and no-op reviews never offer force or execute and unsafe URLs are rejected', async () => {
  const dom = setup(),
    calls = []
  let plan = {
    ...upstreamReview,
    status: 'blocked',
    reason: '<script>Existing upstream points elsewhere</script>',
  }
  const { panel, root } = await mount(async (method, parameters) => {
    calls.push({ method, parameters })
    if (method === 'repository_context') return verified
    if (method === 'upstream_setup_preview') return plan
    throw new Error('Unexpected request: ' + method)
  })
  try {
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    button(root, 'Review parent upstream setup').click()
    await until(() =>
      root.textContent.includes('Existing upstream points elsewhere')
    )
    assert.equal(root.querySelector('script'), null)
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    plan = { ...upstreamReview, status: 'already_configured' }
    button(root, 'Review parent upstream setup').click()
    await until(() =>
      root.textContent.includes(
        'Upstream is already configured for the parent repository'
      )
    )
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    plan = { ...upstreamReview, status: 'not_fork', url: null, parent: null }
    button(root, 'Review parent upstream setup').click()
    await until(() =>
      root.textContent.includes('Parent upstream setup is not needed')
    )
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    plan = {
      ...upstreamReview,
      url: 'https://secret:credential@github.com/parent/project.git?token=hidden',
    }
    button(root, 'Review parent upstream setup').click()
    await until(
      () =>
        root.textContent.includes('Invalid parent upstream setup review') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert(!root.textContent.includes('credential'))
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    assert.equal(
      calls.filter(call => call.method === 'setup_upstream').length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('late upstream reviews and uncertain setup failures stay fenced to their repository without replay or releasing a newer read', async () => {
  const dom = setup(),
    oldReview = deferred(),
    setupReply = deferred(),
    newestRead = deferred(),
    calls = []
  let previews = 0,
    reads = 0,
    changes = 0
  const { panel, container, root } = await mount(
    async (method, parameters) => {
      calls.push({ method, parameters })
      if (method === 'repository_context') {
        reads++
        return reads === 3
          ? newestRead.promise
          : { ...verified, basis: reads === 1 ? 'old-context' : 'next-context' }
      }
      if (method === 'upstream_setup_preview') {
        previews++
        return previews === 1
          ? oldReview.promise
          : { ...upstreamReview, basis: 'next-upstream-review' }
      }
      if (method === 'setup_upstream') return setupReply.promise
      throw new Error('Unexpected request: ' + method)
    },
    async () => {
      changes++
    }
  )
  try {
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    button(root, 'Review parent upstream setup').click()
    panel.setRepository('/next')
    button(root, 'Load contribution settings').click()
    await until(
      () =>
        root.querySelector('select') &&
        !button(root, 'Load contribution settings').disabled
    )
    oldReview.resolve({
      ...upstreamReview,
      url: 'https://github.com/old-parent/old-project.git',
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert(!root.textContent.includes('old-parent'))
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    button(root, 'Review parent upstream setup').click()
    await until(
      () =>
        button(root, 'Confirm parent upstream setup') &&
        !button(root, 'Confirm parent upstream setup').disabled
    )
    button(root, 'Confirm parent upstream setup').click()
    panel.setRepository('/newest')
    button(root, 'Load contribution settings').click()
    setupReply.reject(new Error('Setup disconnected after publication'))
    await until(() => changes === 1)
    assert(button(container, 'Save preferences').disabled)
    assert(!root.textContent.includes('Setup disconnected'))
    newestRead.resolve({
      ...verified,
      basis: 'newest-context',
      remote: 'newest-origin',
    })
    await until(
      () =>
        root.querySelector('select') &&
        !button(root, 'Load contribution settings').disabled
    )
    assert(root.textContent.includes('Fetch remote: newest-origin'))
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    assert.deepEqual(
      calls.filter(call => call.method === 'setup_upstream'),
      [
        {
          method: 'setup_upstream',
          parameters: { basis: 'next-upstream-review' },
        },
      ]
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('same-root account basis changes clear cached parent metadata and pending upstream reviews', async () => {
  const dom = setup(),
    late = deferred(),
    calls = []
  let slow = false
  const { panel, root } = await mount(async (method, parameters) => {
    calls.push({ method, parameters })
    if (method === 'repository_context') return verified
    if (method === 'upstream_setup_preview')
      return slow
        ? late.promise
        : {
            basis: 'parent-review',
            status: 'add',
            remote: 'upstream',
            url: 'https://github.com/upstream-owner/project.git',
            parent: verified.repository.parent,
            reason: null,
          }
    throw new Error('Unexpected request: ' + method)
  })
  try {
    panel.setRepository('/repo', 'actor-a')
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    button(root, 'Review parent upstream setup').click()
    await until(() => button(root, 'Confirm parent upstream setup'))
    panel.setRepository('/repo', 'actor-b')
    assert.equal(root.querySelector('select'), null)
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    assert(!root.textContent.includes('upstream-owner'))
    button(root, 'Load contribution settings').click()
    await until(() => root.querySelector('select'))
    slow = true
    button(root, 'Review parent upstream setup').click()
    panel.setRepository('/repo', 'actor-c')
    late.resolve({
      basis: 'old-actor-parent-review',
      status: 'add',
      remote: 'upstream',
      url: 'https://github.com/old-actor/project.git',
      parent: { host: 'github.com', owner: 'old-actor', name: 'project' },
      reason: null,
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(root.querySelector('select'), null)
    assert.equal(button(root, 'Confirm parent upstream setup'), undefined)
    assert(!root.textContent.includes('old-actor'))
    assert.equal(
      calls.filter(call => call.method === 'setup_upstream').length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
