import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
async function until(check) {
  for (let n = 0; n < 250; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'deletion UI did not settle')
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
    item => item.textContent === text
  )
}
function input(root, text) {
  return [...root.querySelectorAll('label')]
    .find(item => item.textContent.includes(text))
    .querySelector('input')
}
function submit(dom, root) {
  button(root, 'Review branch deletion')
    .closest('form')
    .dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true })
    )
}
const oid = 'a'.repeat(40),
  main = {
    name: 'main',
    ref: 'refs/heads/main',
    oid,
    local: true,
    upstream: null,
    worktree: null,
  },
  victim = { ...main, name: 'victim', ref: 'refs/heads/victim' },
  snapshot = { root: '/repo', branch: 'victim', files: [] }
const review = {
  basis: 'reviewed',
  branch: victim,
  current: true,
  force_required: true,
  in_use_worktree: null,
  checkout: {
    target: { branch: 'main' },
    dirty: true,
    can_leave: true,
    source_branch: 'victim',
    source_stash: { message: 'previous saved work' },
    files: [{ display_path: '<img src=x>' }],
    operation: null,
    conflicted: false,
    occupied_worktree: null,
  },
}
function record(phase = 'complete') {
  return {
    id: 'receipt',
    name: 'victim',
    oid,
    phase,
    error: null,
    backup_oid: oid,
    current_oid: null,
    restored_as: null,
    restored_oid: null,
    checkout_receipt_id: 'switch-id',
  }
}

test('deletion requires reviewed force/stash consent, restores without switching, and forgets only after explicit confirmation', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  let records = [],
    branches = [main, victim],
    changed = 0,
    panel
  panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_list') return branches
      if (method === 'branch_rename_history') return []
      if (method === 'deleted_branches') return records
      if (method === 'delete_branch_preview') return review
      if (method === 'delete_branch') {
        records = [record()]
        branches = [main]
      }
      if (method === 'restore_deleted_branch') {
        records = [
          {
            ...record('restored'),
            current_oid: oid,
            restored_as: 'victim',
            restored_oid: oid,
          },
        ]
        branches = [main, victim]
      }
      if (method === 'forget_deleted_branch') records = []
      return { code: 0 }
    },
    async onChanged() {
      changed++
    },
    onBusy(value) {
      panel.setEnabled(!value)
    },
  })
  try {
    panel.setSnapshot(snapshot)
    const root = document.querySelector('.branch-delete')
    await until(() => root.querySelector('select').value === victim.ref)
    submit(dom, root)
    await until(() => button(root, 'Delete reviewed branch'))
    assert.deepEqual(
      [
        ...root.querySelectorAll(
          '[aria-label="Branch deletion review"] > p .ref-component'
        ),
      ].map(node => node.textContent),
      ['victim', oid]
    )
    assert(button(root, 'Delete reviewed branch').disabled)
    input(root, 'Delete this branch even though').click()
    assert(button(root, 'Delete reviewed branch').disabled)
    input(root, 'Replace my previous saved stash').click()
    assert.equal(button(root, 'Delete reviewed branch').disabled, false)
    assert.equal(root.querySelector('img'), null)
    button(root, 'Delete reviewed branch').click()
    await until(() => changed === 1 && button(root, 'Restore deleted branch'))
    assert.deepEqual(
      calls.find(call => call.method === 'delete_branch').parameters,
      {
        name: victim.ref,
        to_checkout: null,
        force: true,
        strategy: 'StashOnCurrentBranch',
        replace_stash: true,
        restore_index: false,
        basis: 'reviewed',
      }
    )
    assert(root.textContent.includes('switch-id'))
    button(root, 'Restore deleted branch').click()
    await until(
      () =>
        changed === 2 &&
        root.textContent.includes('Branch tip and settings restored')
    )
    assert.deepEqual(
      calls.find(call => call.method === 'restore_deleted_branch').parameters,
      { receipt_id: 'receipt', name: null }
    )
    button(root, 'Forget branch recovery…').click()
    assert.equal(
      calls.some(call => call.method === 'forget_deleted_branch'),
      false
    )
    button(root, 'Permanently forget branch recovery').click()
    await until(() => !button(root, 'Restore deleted branch'))
    assert.deepEqual(
      calls.find(call => call.method === 'forget_deleted_branch').parameters,
      { receipt_id: 'receipt' }
    )
    assert.equal(
      calls.some(call =>
        ['checkout', 'stash_drop', 'stash_apply'].includes(call.method)
      ),
      false
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('held worktrees block deletion, failed mutations retain recovery notices, and late previews cannot cross roots', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  let held = true,
    records = [],
    pending,
    slow = false
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_list') return [main, victim]
      if (method === 'branch_rename_history') return []
      if (method === 'deleted_branches') return records
      if (method === 'delete_branch_preview') {
        const value = {
          ...review,
          force_required: false,
          checkout: null,
          in_use_worktree: held ? '/held/worktree' : null,
        }
        if (slow)
          return new Promise(resolve => {
            pending = () => resolve(value)
          })
        return value
      }
      if (method === 'delete_branch') {
        records = [
          {
            ...record('deleting'),
            error: '<script>native failure</script>',
            current_oid: oid,
          },
        ]
        throw new Error('Deletion stopped; backup retained')
      }
      return { code: 0 }
    },
    async onChanged() {},
  })
  try {
    panel.setSnapshot(snapshot)
    const root = document.querySelector('.branch-delete')
    await until(() => root.querySelector('select').value === victim.ref)
    submit(dom, root)
    await until(() => button(root, 'Delete reviewed branch'))
    assert(button(root, 'Delete reviewed branch').disabled)
    held = false
    submit(dom, root)
    await until(
      () =>
        button(root, 'Delete reviewed branch') &&
        !button(root, 'Delete reviewed branch').disabled
    )
    button(root, 'Delete reviewed branch').click()
    await until(() =>
      root.textContent.includes('Deletion stopped; backup retained')
    )
    assert(
      root.textContent.includes('deleting') &&
        root.textContent.includes('native failure')
    )
    assert.equal(root.querySelector('script'), null)
    slow = true
    submit(dom, root)
    await until(() => pending)
    panel.setSnapshot({ ...snapshot, root: '/other', branch: 'main' })
    pending()
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.equal(button(root, 'Delete reviewed branch'), undefined)
    assert.equal(
      calls.filter(call => call.method === 'delete_branch').length,
      1
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('combined deletion reviews the canonical upstream, requires separate consent and refreshes linked remote recovery after failure', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  const remoteReview = {
    basis: 'remote-basis',
    remote: 'team/origin',
    reference: 'refs/heads/server-topic',
    endpoints: [
      {
        index: 0,
        destination: 'Push destination 1',
        expected: oid,
        available_locally: false,
        phase: 'pending',
        error: null,
        restored_as: [],
      },
      {
        index: 1,
        destination: 'Push destination 2',
        expected: null,
        available_locally: false,
        phase: 'pending',
        error: null,
        restored_as: [],
      },
    ],
  }
  const plan = {
    ...review,
    current: false,
    force_required: false,
    checkout: null,
    upstream: remoteReview,
  }
  let local = [],
    remote = [],
    panel,
    changed = 0
  panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_list') return [main, victim]
      if (method === 'branch_rename_history') return []
      if (method === 'deleted_branches') return local
      if (method === 'remote_deletion_targets')
        return { remotes: ['team/origin'], upstreams: [] }
      if (method === 'remote_deletion_history') return remote
      if (method === 'delete_branch_preview') return plan
      if (method === 'delete_branch') {
        local = [
          {
            ...record('deleting_upstream'),
            remote_deletion_receipt_id: 'remote-receipt',
            error: 'Server refused deletion',
          },
        ]
        remote = [
          {
            id: 'remote-receipt',
            remote: remoteReview.remote,
            reference: remoteReview.reference,
            phase: 'pushing',
            local_deletion_receipt_id: 'receipt',
            error: 'Server refused <img src=x>',
            warnings: [],
            endpoints: [
              {
                ...remoteReview.endpoints[0],
                phase: 'failed',
                backup_ref: 'refs/desktop/deleted-remotes/remote-receipt/0',
                backup_oid: oid,
                backup_direct: true,
              },
            ],
          },
        ]
        throw new Error(
          'Local branch deleted; inspect linked upstream recovery'
        )
      }
      return { code: 0 }
    },
    async onChanged() {
      changed++
    },
    onBusy(value) {
      panel.setEnabled(!value)
    },
  })
  try {
    panel.setSnapshot(snapshot)
    const root = document.querySelector('.branch-delete')
    await until(() => root.querySelector('select').value === victim.ref)
    input(root, 'Also delete this branch’s configured upstream').click()
    input(root, 'Fetch missing upstream recovery tips').click()
    const node = input(root, 'Expected upstream IDs'),
      setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      ).set
    setter.call(node, oid + ', missing')
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    submit(dom, root)
    await until(() => button(root, 'Delete reviewed branch'))
    assert(button(root, 'Delete reviewed branch').disabled)
    assert(
      root.textContent.includes('refs/heads/server-topic') &&
        root.textContent.includes('team/origin')
    )
    assert.deepEqual(
      calls.find(c => c.method === 'delete_branch_preview').parameters.upstream,
      { fetch_backup: true, expected: [oid, null] }
    )
    panel.setEnabled(false)
    panel.setEnabled(true)
    assert(button(root, 'Delete reviewed branch').disabled)
    input(root, 'Delete this reviewed upstream after local deletion').click()
    assert(!button(root, 'Delete reviewed branch').disabled)
    button(root, 'Delete reviewed branch').click()
    await until(
      () =>
        changed === 1 &&
        root.textContent.includes('remote-receipt') &&
        document
          .querySelector('.remote-delete')
          .textContent.includes('Related local deletion record: receipt')
    )
    assert(
      root.textContent.includes(
        'Local branch deleted; inspect linked upstream recovery'
      )
    )
    assert.equal(document.querySelector('.remote-delete img'), null)
    assert.deepEqual(calls.find(c => c.method === 'delete_branch').parameters, {
      name: victim.ref,
      to_checkout: null,
      force: false,
      strategy: 'StashOnCurrentBranch',
      replace_stash: false,
      restore_index: false,
      basis: 'reviewed',
      upstream: { fetch_backup: true, expected: [oid, null] },
    })
    assert.equal(calls.filter(c => c.method === 'delete_branch').length, 1)
    submit(dom, root)
    await until(() => button(root, 'Delete reviewed branch'))
    assert(button(root, 'Delete reviewed branch').disabled)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('default branch permissions block deletion review and refresh when the detected default changes', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  const protectedMain = {
    ...main,
    policy: {
      name: 'main',
      reference: 'refs/heads/main',
      is_default: true,
      published: false,
      can_delete: false,
      can_rename: true,
      delete_reason: 'The detected default branch cannot be deleted',
      rename_reason: null,
    },
  }
  let branches = [protectedMain, victim]
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_list') return branches
      if (method === 'delete_branch_preview') return { ...review, branch: main }
      if (method === 'remote_deletion_targets')
        return { remotes: [], upstreams: [] }
      return []
    },
    async onChanged() {},
  })
  try {
    panel.setSnapshot({
      root: '/repo',
      branch: 'main',
      files: [],
      default_branch: { reference: main.ref },
    })
    const root = document.querySelector('.branch-delete')
    await until(() => root.querySelector('select').value === main.ref)
    assert(button(root, 'Review branch deletion').disabled)
    assert(root.textContent.includes('default branch cannot be deleted'))
    submit(dom, root)
    await new Promise(resolve => setTimeout(resolve, 10))
    assert(!calls.some(call => call.method === 'delete_branch_preview'))
    branches = [
      main,
      {
        ...victim,
        policy: {
          ...protectedMain.policy,
          name: 'victim',
          reference: victim.ref,
        },
      },
    ]
    panel.setSnapshot({
      root: '/repo',
      branch: 'main',
      files: [],
      default_branch: { reference: victim.ref },
    })
    await until(() => !button(root, 'Review branch deletion').disabled)
    submit(dom, root)
    await until(() => button(root, 'Delete reviewed branch'))
    assert.equal(
      calls.filter(call => call.method === 'delete_branch_preview').length,
      1
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('repository context changes clear deletion consent and reload history even when root and default branch remain unchanged', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  let historyMessage = 'history-before'
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_list') return [main, victim]
      if (method === 'deleted_branches')
        return [{ ...record('deleting'), error: historyMessage }]
      if (method === 'delete_branch_preview')
        return { ...review, force_required: false, checkout: null }
      if (method === 'remote_deletion_targets')
        return { remotes: [], upstreams: [] }
      return []
    },
    async onChanged() {},
  })
  try {
    const current = { ...snapshot, default_branch: { reference: main.ref } }
    panel.setSnapshot({
      ...current,
      repository_context: { basis: 'context-before' },
    })
    const root = document.querySelector('.branch-delete')
    await until(
      () =>
        root.querySelector('select').value === victim.ref &&
        root.textContent.includes('history-before')
    )
    submit(dom, root)
    await until(
      () =>
        button(root, 'Delete reviewed branch') &&
        !button(root, 'Delete reviewed branch').disabled
    )
    const previousHistoryCalls = calls.filter(
      call => call.method === 'deleted_branches'
    ).length
    historyMessage = 'history-after'
    panel.setSnapshot({
      ...current,
      repository_context: { basis: 'context-after' },
    })
    assert.equal(button(root, 'Delete reviewed branch'), undefined)
    assert.equal(
      calls.filter(call => call.method === 'delete_branch').length,
      0
    )
    await until(
      () =>
        root.querySelector('select').value === victim.ref &&
        root.textContent.includes('history-after')
    )
    assert(!root.textContent.includes('history-before'))
    assert(
      calls.filter(call => call.method === 'deleted_branches').length >
        previousHistoryCalls
    )
    submit(dom, root)
    await until(
      () =>
        button(root, 'Delete reviewed branch') &&
        !button(root, 'Delete reviewed branch').disabled
    )
    assert.equal(
      calls.filter(call => call.method === 'delete_branch_preview').length,
      2
    )
    assert.equal(
      calls.filter(call => call.method === 'delete_branch').length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
