import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { nameRules } from './name-rules-fixture.mjs'
async function until(check) {
  for (let n = 0; n < 200; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'Branch rename UI did not settle')
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
function value(dom, element, next) {
  Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value'
  ).set.call(element, next)
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}
function submit(dom, root) {
  button(root, 'Review branch rename')
    .closest('form')
    .dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true })
    )
}
const snapshot = { root: '/repo', branch: 'main', files: [] }
const review = {
  basis: 'reviewed',
  name: 'main',
  new_name: 'renamed',
  oid: 'a'.repeat(40),
  unchanged: false,
  saved_stashes: [{ oid: 'b'.repeat(40), message: 'source saved' }],
  destination_stashes: [{ oid: 'c'.repeat(40), message: 'destination saved' }],
}

test('rename requires review, passes its basis, preserves recovery notices and only acknowledges metadata', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js')
  const calls = []
  let changes = 0,
    records = [],
    fail = false
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_rename_history') return records
      if (method === 'rename_branch_preview') return review
      if (method === 'rename_branch') {
        if (fail) {
          records = [
            {
              receipt: {
                id: 'receipt',
                name: 'main',
                new_name: 'renamed',
                phase: 'renaming',
                error: '<img src=x> native failure',
              },
              saved_stashes: review.saved_stashes,
            },
          ]
          throw new Error('Git rename failed; saved originals remain')
        }
        return { code: 0 }
      }
      if (method === 'acknowledge_branch_rename') records = []
      return { code: 0 }
    },
    async onChanged() {
      changes++
    },
  })
  try {
    panel.setSnapshot(snapshot)
    const root = document.querySelector('.branch-rename')
    value(dom, root.querySelector('input'), 'renamed')
    submit(dom, root)
    await until(() => button(root, 'Confirm branch rename'))
    assert.deepEqual(
      [
        ...root.querySelectorAll(
          '[aria-label="Branch rename review"] .ref-component'
        ),
      ].map(node => node.textContent),
      ['main', 'renamed', 'a'.repeat(40)]
    )
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      0
    )
    assert(root.textContent.includes('Move 1 saved change sets'))
    assert(root.textContent.includes('Keep 1 existing'))
    assert.deepEqual(
      calls.find(call => call.method === 'rename_branch_preview').parameters,
      { name: 'refs/heads/main', new_name: 'renamed' }
    )
    value(dom, root.querySelector('input'), 'changed')
    assert.equal(button(root, 'Confirm branch rename'), undefined)
    value(dom, root.querySelector('input'), 'renamed')
    submit(dom, root)
    await until(() => button(root, 'Confirm branch rename'))
    button(root, 'Confirm branch rename').click()
    await until(
      () =>
        changes === 1 &&
        root.textContent.includes(
          'Branch renamed and saved changes reassociated'
        )
    )
    assert.deepEqual(
      calls.find(call => call.method === 'rename_branch').parameters,
      { name: 'refs/heads/main', new_name: 'renamed', basis: 'reviewed' }
    )
    fail = true
    submit(dom, root)
    await until(() => button(root, 'Confirm branch rename'))
    button(root, 'Confirm branch rename').click()
    await until(
      () =>
        changes === 2 &&
        root.textContent.includes('Git rename failed; saved originals remain')
    )
    assert(
      root.textContent.includes('renaming') &&
        root.textContent.includes('source saved')
    )
    assert.equal(root.querySelector('img'), null)
    button(root, 'Acknowledge branch rename notice').click()
    await until(() => !button(root, 'Acknowledge branch rename notice'))
    assert.deepEqual(
      calls.find(call => call.method === 'acknowledge_branch_rename')
        .parameters,
      { receipt_id: 'receipt' }
    )
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      2
    )
    assert.equal(
      calls.some(call =>
        ['stash_drop', 'stash_apply', 'checkout'].includes(call.method)
      ),
      false
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('late rename previews and history cannot cross repositories or trigger a rename', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js')
  let reply,
    historyReply,
    holdHistory = false
  const calls = []
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_rename_history') {
        if (holdHistory)
          return new Promise(resolve => {
            historyReply = resolve
          })
        return []
      }
      if (method === 'rename_branch_preview')
        return new Promise(resolve => {
          reply = resolve
        })
      return { code: 0 }
    },
    async onChanged() {},
  })
  try {
    panel.setSnapshot(snapshot)
    const root = document.querySelector('.branch-rename')
    value(dom, root.querySelector('input'), 'renamed')
    submit(dom, root)
    await until(() => reply)
    panel.setSnapshot({ ...snapshot, root: '/other', branch: 'other' })
    reply(review)
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.equal(button(root, 'Confirm branch rename'), undefined)
    assert.equal(root.querySelector('input').value, '')
    assert.equal(button(root, 'Review branch rename').disabled, false)
    holdHistory = true
    button(root, 'Refresh branch rename history').click()
    await until(() => historyReply)
    holdHistory = false
    panel.setSnapshot(snapshot)
    historyReply([
      {
        receipt: {
          id: 'old',
          name: 'other',
          new_name: 'old',
          phase: 'storing',
          error: 'stale failure',
        },
        saved_stashes: [],
      },
    ])
    await new Promise(resolve => setTimeout(resolve, 15))
    assert(!root.textContent.includes('stale failure'))
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('case-only rename explains the retry boundary and keeps mutation behind review and global readiness', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = [],
    busy = []
  let panel
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
      if (method === 'remote_deletion_targets')
        return { remotes: [], upstreams: [] }
      if (method === 'rename_branch_preview')
        return {
          ...review,
          new_name: 'MAIN',
          case_only: true,
          case_retry: true,
        }
      return { code: 0 }
    },
    async onChanged() {},
    onBusy(value) {
      busy.push(value)
      panel.setEnabled(!value)
    },
  })
  try {
    panel.setSnapshot(snapshot)
    const root = document.querySelector('.branch-rename')
    value(dom, root.querySelector('input'), 'MAIN')
    submit(dom, root)
    await until(
      () =>
        button(root, 'Confirm branch rename') &&
        !button(root, 'Confirm branch rename').disabled
    )
    assert(
      root.textContent.includes('changes only the branch name’s letter case')
    )
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      0
    )
    panel.setEnabled(false)
    assert(button(root, 'Confirm branch rename').disabled)
    panel.setEnabled(true)
    button(root, 'Confirm branch rename').click()
    await until(
      () =>
        calls.some(call => call.method === 'rename_branch') &&
        root.textContent.includes(
          'Branch renamed and saved changes reassociated'
        )
    )
    assert.deepEqual(
      calls.find(call => call.method === 'rename_branch').parameters,
      { name: 'refs/heads/main', new_name: 'MAIN', basis: 'reviewed' }
    )
    assert.deepEqual(busy, [true, false, true, false])
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('published defaults and invalid permissions disable rename, while unpublished defaults remain reviewable', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  const permissions = {
    name: 'main',
    reference: 'refs/heads/main',
    is_default: true,
    published: true,
    can_delete: false,
    can_rename: false,
    delete_reason: 'The detected default branch cannot be deleted',
    rename_reason: 'The published default branch cannot be renamed',
  }
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'rename_branch_preview')
        return {
          ...review,
          policy: {
            ...permissions,
            published: false,
            can_rename: true,
            rename_reason: null,
          },
        }
      if (method === 'remote_deletion_targets')
        return { remotes: [], upstreams: [] }
      return []
    },
    async onChanged() {},
  })
  try {
    panel.setSnapshot({ ...snapshot, branch_policy: permissions })
    const root = document.querySelector('.branch-rename')
    assert(button(root, 'Review branch rename').disabled)
    assert(
      root.textContent.includes('published default branch cannot be renamed')
    )
    submit(dom, root)
    assert(!calls.some(call => call.method === 'rename_branch_preview'))
    await until(
      () =>
        calls.filter(call => call.method === 'branch_rename_history').length ===
        1
    )
    const historyCalls = calls.filter(
      call => call.method === 'branch_rename_history'
    ).length
    panel.setSnapshot({
      ...snapshot,
      branch_policy: {
        ...permissions,
        published: false,
        can_rename: true,
        rename_reason: null,
      },
    })
    await until(
      () =>
        calls.filter(call => call.method === 'branch_rename_history').length >
        historyCalls
    )
    value(dom, root.querySelector('input'), 'renamed')
    submit(dom, root)
    await until(() => button(root, 'Confirm branch rename'))
    panel.setSnapshot({ ...snapshot, branch_policy: permissions })
    assert.equal(button(root, 'Confirm branch rename'), undefined)
    assert(button(root, 'Review branch rename').disabled)
    panel.setSnapshot({
      ...snapshot,
      branch_policy: { ...permissions, can_rename: 'true' },
    })
    assert(button(root, 'Review branch rename').disabled)
    panel.setSnapshot({ ...snapshot, branch_policy: null })
    assert(button(root, 'Review branch rename').disabled)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('repository context changes immediately clear rename review and reload recovery history with unchanged branch permissions', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  let historyName = 'history-before'
  const permissions = {
    name: 'main',
    reference: 'refs/heads/main',
    is_default: false,
    published: true,
    can_delete: true,
    can_rename: true,
    delete_reason: null,
    rename_reason: null,
  }
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'branch_rename_history')
        return [
          {
            receipt: {
              id: 'recovery',
              name: 'main',
              new_name: historyName,
              phase: 'renaming',
              error: null,
            },
            saved_stashes: [],
          },
        ]
      if (method === 'rename_branch_preview') return review
      if (method === 'remote_deletion_targets')
        return { remotes: [], upstreams: [] }
      return []
    },
    async onChanged() {},
  })
  try {
    const current = {
      ...snapshot,
      default_branch: { reference: 'refs/heads/trunk' },
      branch_policy: permissions,
    }
    panel.setSnapshot({
      ...current,
      repository_context: { basis: 'context-before' },
    })
    const root = document.querySelector('.branch-rename')
    await until(() => root.textContent.includes('history-before'))
    value(dom, root.querySelector('input'), 'renamed')
    submit(dom, root)
    await until(
      () =>
        button(root, 'Confirm branch rename') &&
        !button(root, 'Confirm branch rename').disabled
    )
    const previousHistoryCalls = calls.filter(
      call => call.method === 'branch_rename_history'
    ).length
    historyName = 'history-after'
    panel.setSnapshot({
      ...current,
      repository_context: { basis: 'context-after' },
    })
    assert.equal(button(root, 'Confirm branch rename'), undefined)
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      0
    )
    await until(() => root.textContent.includes('history-after'))
    assert(!root.textContent.includes('history-before'))
    assert(
      calls.filter(call => call.method === 'branch_rename_history').length >
        previousHistoryCalls
    )
    value(dom, root.querySelector('input'), 'renamed')
    submit(dom, root)
    await until(
      () =>
        button(root, 'Confirm branch rename') &&
        !button(root, 'Confirm branch rename').disabled
    )
    assert.equal(
      calls.filter(call => call.method === 'rename_branch_preview').length,
      2
    )
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      0
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('rename rules refuse blocked names, allow disclosed bypass, preserve uncertainty and reject malformed or stale policy reviews', async () => {
  const dom = setup(),
    { mountRecovery } = await import('../panels.js'),
    calls = []
  let fields = {
      result: 'blocked',
      reason: '<img src=x> restricted by rules',
      failed: [{ ruleset_id: 2, description: '<script>name pattern</script>' }],
    },
    changed = 0
  const panel = mountRecovery(document.querySelector('#root'), {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'rename_branch_preview')
        return {
          ...review,
          name: parameters.name.replace(/^refs\/heads\//, ''),
          new_name: parameters.new_name,
          name_rules: nameRules(parameters.new_name, fields),
          allowed: true,
        }
      if (method === 'rename_branch') return { code: 0 }
      if (method === 'remote_deletion_targets')
        return { remotes: [], upstreams: [] }
      return []
    },
    async onChanged() {
      changed++
    },
  })
  try {
    panel.setSnapshot(snapshot)
    const root = document.querySelector('.branch-rename')
    value(dom, root.querySelector('input'), 'restricted')
    submit(dom, root)
    await until(() => button(root, 'Confirm branch rename'))
    assert(button(root, 'Confirm branch rename').disabled)
    assert(
      root.textContent.includes(
        'GitHub repository rules restrict this branch name'
      )
    )
    assert(root.textContent.includes('<img src=x> restricted by rules'))
    assert.equal(root.querySelector('img'), null)
    assert.equal(root.querySelector('script'), null)
    button(root, 'Confirm branch rename').click()
    assert(!calls.some(call => call.method === 'rename_branch'))
    fields = {
      result: 'warning',
      reason: 'You can bypass this rule',
      bypassed: [{ ruleset_id: 2, description: 'must start with feature/' }],
    }
    await until(() => !button(root, 'Review branch rename').disabled)
    value(dom, root.querySelector('input'), 'bypass')
    submit(dom, root)
    await until(
      () =>
        button(root, 'Confirm branch rename') &&
        !button(root, 'Confirm branch rename').disabled
    )
    assert(root.textContent.includes('your account can bypass'))
    button(root, 'Confirm branch rename').click()
    await until(
      () => changed === 1 && !button(root, 'Review branch rename').disabled
    )
    assert.deepEqual(
      calls.find(call => call.method === 'rename_branch').parameters,
      { name: 'refs/heads/main', new_name: 'bypass', basis: 'reviewed' }
    )
    fields = {
      status: 'unavailable',
      result: 'not_checked',
      reason: 'Cannot reach GitHub',
    }
    value(dom, root.querySelector('input'), 'uncertain')
    submit(dom, root)
    await until(
      () =>
        button(root, 'Confirm branch rename') &&
        !button(root, 'Confirm branch rename').disabled
    )
    assert(root.textContent.includes('rules could not be checked'))
    assert(!root.textContent.includes('passes the applicable GitHub rules'))
    panel.setSnapshot({ root: '/other', branch: 'topic', files: [] })
    assert.equal(button(root, 'Confirm branch rename'), undefined)
    fields = { result: ['blocked'] }
    value(dom, root.querySelector('input'), 'invalid')
    submit(dom, root)
    await until(() => root.textContent.includes('Invalid branch rename review'))
    assert.equal(button(root, 'Confirm branch rename'), undefined)
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      1
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('shared and legacy Ref render identical, escaped references', async () => {
  const built = await build({
    stdin: {
      contents: `import * as React from 'react'; import * as ReactDOM from 'react-dom';
        import {Ref as Shared} from './upstream/ref';
        import {Ref as Legacy} from '../../../app/src/ui/lib/ref';
        export function render(container, label, legacy) {
          ReactDOM.render(React.createElement(legacy ? Legacy : Shared, null, label), container)
        }`,
      resolveDir: fileURLToPath(new URL('../src', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const { render } = await import(
    `data:text/javascript;base64,${Buffer.from(
      built.outputFiles[0].text
    ).toString('base64')}`
  )
  const dom = setup(),
    container = dom.window.document.querySelector('#root')
  try {
    for (const legacy of [false, true]) {
      render(container, '<img src=x>', legacy)
      assert.equal(container.textContent, '<img src=x>')
      assert.equal(container.querySelector('img'), null)
      assert.equal(
        container.querySelector('em.ref-component').textContent,
        '<img src=x>'
      )
    }
  } finally {
    dom.window.close()
  }
})
