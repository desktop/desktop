import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
async function until(check) {
  for (let n = 0; n < 250; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'remote deletion UI did not settle')
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
function enter(dom, node, text) {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value'
  ).set
  setter.call(node, text)
  node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}
function submit(dom, root) {
  button(root, 'Review remote deletion')
    .closest('form')
    .dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true })
    )
}
const oid = 'a'.repeat(40),
  ep = {
    index: 0,
    destination: 'Push destination 1',
    expected: oid,
    phase: 'pending',
    error: null,
    restored_as: [],
  },
  review = {
    basis: 'reviewed',
    remote: 'team/origin',
    reference: 'refs/heads/server/topic',
    endpoints: [ep],
  },
  targets = {
    remotes: ['team/origin'],
    upstreams: [
      {
        local_ref: 'refs/heads/local',
        remote: 'team/origin',
        branch: 'refs/heads/server/topic',
      },
    ],
  },
  snapshot = { root: '/repo', branch: 'local', files: [] }
function record() {
  return {
    id: 'receipt',
    remote: review.remote,
    reference: review.reference,
    phase: 'pushing',
    error: 'Destination 2 refused <img src=x>',
    warnings: ['First destination already finished'],
    endpoints: [
      { ...ep, phase: 'deleted', backup_oid: oid, backup_direct: true },
    ],
  }
}
test('remote deletion reviews canonical upstream, requires consent, retains failed outcomes and restores/forgets only on explicit actions', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  let records = [],
    changed = 0,
    panel
  panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (
        method === 'branch_list' ||
        method === 'branch_rename_history' ||
        method === 'deleted_branches'
      )
        return []
      if (method === 'remote_deletion_targets') return targets
      if (method === 'remote_deletion_history') return records
      if (method === 'remote_branch_delete_preview') return review
      if (method === 'delete_remote_branch') {
        records = [record()]
        throw new Error('Lease refused')
      }
      if (method === 'forget_remote_deletion') records = []
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
    const root = document.querySelector('.remote-delete')
    await until(
      () => input(root, 'Remote branch').value === 'refs/heads/server/topic'
    )
    input(root, 'Fetch missing recovery').click()
    submit(dom, root)
    await until(() => button(root, 'Delete reviewed remote branch'))
    assert(button(root, 'Delete reviewed remote branch').disabled)
    assert.deepEqual(
      calls.find(c => c.method === 'remote_branch_delete_preview').parameters,
      {
        request: {
          remote: 'team/origin',
          branch: 'refs/heads/server/topic',
          expected: null,
          fetch_backup: true,
        },
      }
    )
    panel.setEnabled(false)
    assert(button(root, 'Delete reviewed remote branch').disabled)
    panel.setEnabled(true)
    assert(button(root, 'Delete reviewed remote branch').disabled)
    input(root, 'Delete the reviewed remote branch').click()
    button(root, 'Delete reviewed remote branch').click()
    await until(
      () =>
        root.textContent.includes('Lease refused') &&
        root.textContent.includes('First destination already finished')
    )
    assert.equal(changed, 1)
    assert.equal(root.querySelector('img'), null)
    assert.equal(button(root, 'Delete reviewed remote branch'), undefined)
    assert.deepEqual(
      calls.find(c => c.method === 'delete_remote_branch').parameters,
      {
        request: {
          remote: 'team/origin',
          branch: 'refs/heads/server/topic',
          expected: null,
          fetch_backup: true,
        },
        basis: 'reviewed',
      }
    )
    enter(
      dom,
      input(root, 'Restore remote tip as local branch'),
      'local-restored'
    )
    button(root, 'Restore remote tip locally').click()
    await until(() => changed === 2)
    assert.deepEqual(
      calls.find(c => c.method === 'restore_remote_tip').parameters,
      { receipt_id: 'receipt', endpoint: 0, name: 'local-restored' }
    )
    button(root, 'Forget remote recovery…').click()
    assert(!calls.some(c => c.method === 'forget_remote_deletion'))
    button(root, 'Permanently forget remote recovery').click()
    await until(
      () => changed === 3 && !button(root, 'Restore remote tip locally')
    )
    assert.deepEqual(
      calls.find(c => c.method === 'forget_remote_deletion').parameters,
      { receipt_id: 'receipt' }
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
test('explicit expectations are sent verbatim and stale remote reviews cannot cross roots or replay mutations', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  let resolveReview,
    resolveDelete,
    changed = 0,
    panel
  panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (
        method === 'branch_list' ||
        method === 'branch_rename_history' ||
        method === 'deleted_branches' ||
        method === 'remote_deletion_history'
      )
        return []
      if (method === 'remote_deletion_targets') return targets
      if (method === 'remote_branch_delete_preview')
        return new Promise(resolve => {
          resolveReview = resolve
        })
      if (method === 'delete_remote_branch')
        return new Promise(resolve => {
          resolveDelete = resolve
        })
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
    let root = document.querySelector('.remote-delete')
    await until(() => input(root, 'Remote branch').value)
    enter(dom, input(root, 'Expected IDs'), oid + ', missing')
    submit(dom, root)
    await until(() => resolveReview)
    panel.setSnapshot({ ...snapshot, root: '/other' })
    resolveReview(review)
    await new Promise(r => setTimeout(r, 30))
    assert(!button(root, 'Delete reviewed remote branch'))
    assert(!calls.some(c => c.method === 'delete_remote_branch'))
    await until(() => input(root, 'Remote branch').value)
    enter(dom, input(root, 'Expected IDs'), oid + ', missing')
    submit(dom, root)
    await until(
      () =>
        calls.filter(c => c.method === 'remote_branch_delete_preview')
          .length === 2
    )
    resolveReview(review)
    await until(() => button(root, 'Delete reviewed remote branch'))
    assert.deepEqual(
      calls.filter(c => c.method === 'remote_branch_delete_preview')[1]
        .parameters.request.expected,
      [oid, null]
    )
    input(root, 'Delete the reviewed remote branch').click()
    button(root, 'Delete reviewed remote branch').click()
    await until(() => resolveDelete)
    panel.setSnapshot({ ...snapshot, root: '/third' })
    resolveDelete({ code: 0 })
    await new Promise(r => setTimeout(r, 30))
    assert.equal(changed, 0)
    assert.equal(
      calls.filter(c => c.method === 'delete_remote_branch').length,
      1
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
