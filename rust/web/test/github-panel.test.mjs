import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// Exercise current source without rewriting the checked-in embedded bundle.
let panelModule
function sourcePanel() {
  panelModule ??= build({
    entryPoints: [
      fileURLToPath(new URL('../src/github-panel.tsx', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then(result =>
    import(
      `data:text/javascript;base64,${Buffer.from(
        result.outputFiles[0].text
      ).toString('base64')}`
    )
  )
  return panelModule
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(check(), 'DOM condition did not become true')
}

test('React GitHub views handle auth, review/merge, issues, checks, unsafe content, and stale replies', async () => {
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
  const { mountGitHub } = await sourcePanel()
  const root = document.querySelector('#root')
  const calls = []
  let issueClosed = false
  let slow
  const ok = data => ({ code: 0, data, stdout: '', stderr: '' })
  const panel = mountGitHub(root, {
    async request(request) {
      calls.push(request)
      const { action } = request
      if (slow && action.type === 'pull_requests') return slow.promise
      switch (action.type) {
        case 'auth_status':
          return ok({
            hosts: { 'github.com': [{ login: 'user', active: true }] },
          })
        case 'pull_requests':
          return ok([
            {
              number: 7,
              title: '<img src=x onerror=bad()>',
              state: 'OPEN',
              url: 'javascript:bad()',
            },
          ])
        case 'pull_request':
          return ok({
            number: 7,
            title: 'PR details',
            headRefOid: 'a'.repeat(40),
            state: 'OPEN',
          })
        case 'pull_request_checks':
          return {
            code: 8,
            data: [{ name: 'CI', state: 'PENDING' }],
            stdout: '',
            stderr: '',
            hint: 'Checks are pending',
          }
        case 'issues':
          return ok([
            {
              number: 8,
              title: 'Issue title',
              state: 'OPEN',
              url: 'https://github.com/owner/repo/issues/8',
            },
          ])
        case 'issue':
          return ok({
            number: 8,
            title: 'Issue detail',
            body: '<script>bad()</script>',
            state: issueClosed ? 'CLOSED' : 'OPEN',
          })
        case 'close_issue':
          issueClosed = true
          break
        case 'reopen_issue':
          issueClosed = false
          break
      }
      return { code: 0, data: null, stdout: 'Completed', stderr: '' }
    },
    async onChanged() {},
  })
  function button(text) {
    const result = [...root.querySelectorAll('button')].find(
      button => button.textContent === text
    )
    assert.ok(result, `missing button ${text}`)
    return result
  }
  function click(text) {
    const control = button(text)
    assert.equal(control.disabled, false, `disabled ${text}`)
    control.click()
  }
  function field(label) {
    const node = [...root.querySelectorAll('label')].find(node =>
      node.textContent.startsWith(label)
    )
    assert.ok(node, `missing field ${label}`)
    return node.querySelector('input,textarea,select')
  }
  function input(label, value) {
    const control = field(label)
    if (control.tagName === 'SELECT') {
      control.value = value
      control.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      return
    }
    const prototype =
      control.tagName === 'TEXTAREA'
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, value)
    control.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  }
  async function ready() {
    await waitFor(() => !button('Authentication').disabled)
  }
  function submit(text) {
    button(text)
      .closest('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
  }
  try {
    click('Authentication')
    await waitFor(() => root.textContent.includes('github.com'))
    assert.equal(Object.hasOwn(calls.at(-1), 'account_basis'), false)
    panel.setRepository('/repo-one')
    await waitFor(() => root.textContent.includes('Repository selected'))
    click('Pull requests')
    await waitFor(() => root.textContent.includes('<img src=x onerror=bad()>'))
    assert.equal(Object.hasOwn(calls.at(-1), 'account_basis'), false)
    assert.equal(root.querySelector('img'), null)
    assert.equal(root.querySelector('a[href^="javascript:"]'), null)
    input('Filter results', 'img')
    assert.equal(root.querySelector('mark')?.textContent, 'img')
    root.querySelector('.github-items button').click()
    await waitFor(() => root.textContent.includes('PR details'))
    click('Checks')
    await waitFor(() => root.textContent.includes('Checks are pending'))
    await ready()
    input('Review', 'approve')
    const body = 'Literal $(shell)\n\nReview detail'
    input('Review body', body)
    submit('Submit review')
    await waitFor(() =>
      calls.some(call => call.action.type === 'review_pull_request')
    )
    await ready()
    assert.deepEqual(
      calls.find(call => call.action.type === 'review_pull_request').action,
      { type: 'review_pull_request', number: 7, review: 'approve', body }
    )
    click('Merge reviewed head')
    await waitFor(() =>
      calls.some(call => call.action.type === 'merge_pull_request')
    )
    await ready()
    assert.equal(
      calls.find(call => call.action.type === 'merge_pull_request').action
        .head_commit,
      'a'.repeat(40)
    )
    click('Issues')
    await waitFor(() => root.textContent.includes('Issue title'))
    root.querySelector('.github-items button').click()
    await waitFor(() => root.textContent.includes('Issue detail'))
    assert.equal(root.querySelector('script'), null)
    input('Comment', 'Hello\n\nLiteral `body`')
    submit('Post comment')
    await waitFor(() => calls.some(call => call.action.type === 'comment'))
    await ready()
    assert.equal(
      calls.find(call => call.action.type === 'comment').action.body,
      'Hello\n\nLiteral `body`'
    )
    assert.equal(field('Comment').value, '')
    click('Close issue')
    await waitFor(() =>
      [...root.querySelectorAll('button')].some(
        button => button.textContent === 'Reopen issue'
      )
    )
    click('Reopen issue')
    await ready()
    input('Title', 'A new issue')
    input('Body', 'Body\nwith paragraphs')
    submit('Create issue')
    await waitFor(() => calls.some(call => call.action.type === 'create_issue'))
    await ready()
    assert.deepEqual(
      calls.find(call => call.action.type === 'create_issue').action,
      {
        type: 'create_issue',
        title: 'A new issue',
        body: 'Body\nwith paragraphs',
      }
    )
    let resolve
    slow = {
      promise: new Promise(done => {
        resolve = done
      }),
    }
    click('Pull requests')
    panel.setRepository('/repo-two')
    await waitFor(() => root.textContent.includes('Repository selected'))
    resolve(ok([{ number: 999, title: 'Stale repository response' }]))
    await ready()
    assert.ok(!root.textContent.includes('Stale repository response'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('same-root account changes discard GitHub details and late replies preserve newer busy ownership', async () => {
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
  const { mountGitHub } = await sourcePanel(),
    root = document.querySelector('#root'),
    calls = [],
    pending = []
  let slow = false
  const ok = data => ({ code: 0, data, stdout: '', stderr: '' })
  const panel = mountGitHub(root, {
    async request(request) {
      calls.push(request)
      if (slow) return new Promise(resolve => pending.push(resolve))
      return request.action.type === 'pull_request'
        ? ok({
            number: 7,
            title: 'Previous actor detail',
            headRefOid: 'a'.repeat(40),
          })
        : ok([{ number: 7, title: 'Previous actor list' }])
    },
    async onChanged() {},
  })
  const control = text =>
    [...root.querySelectorAll('button')].find(
      button => button.textContent === text
    )
  try {
    panel.setRepository('/repo', 'actor-a')
    control('Pull requests').click()
    await waitFor(() => root.textContent.includes('Previous actor list'))
    root.querySelector('.github-items button').click()
    await waitFor(() => root.textContent.includes('Previous actor detail'))
    await waitFor(() => !control('Authentication').disabled)
    assert.deepEqual(
      calls.map(call => call.account_basis),
      ['actor-a', 'actor-a']
    )
    panel.setRepository('/repo', 'actor-b')
    assert(!root.textContent.includes('Previous actor'))
    assert.equal(control('Merge reviewed head'), undefined)
    slow = true
    control('Pull requests').click()
    const queued = calls.at(-1)
    assert.equal(queued.account_basis, 'actor-b')
    assert(control('Authentication').disabled)
    panel.setRepository('/repo', 'actor-c')
    assert.equal(queued.account_basis, 'actor-b')
    assert.equal(control('Authentication').disabled, false)
    control('Pull requests').click()
    assert.equal(calls.at(-1).account_basis, 'actor-c')
    assert.equal(pending.length, 2)
    pending[0](ok([{ number: 9, title: 'Late old account response' }]))
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!root.textContent.includes('Late old account response'))
    assert(control('Authentication').disabled)
    pending[1](ok([{ number: 10, title: 'Current account response' }]))
    await waitFor(() => root.textContent.includes('Current account response'))
    await waitFor(() => !control('Authentication').disabled)
    assert.deepEqual(
      calls.map(call => call.account_basis),
      ['actor-a', 'actor-a', 'actor-b', 'actor-c']
    )
    assert(
      calls.every(call =>
        ['pull_requests', 'pull_request'].includes(call.action.type)
      )
    )
    slow = false
    control('Authentication').click()
    await waitFor(() => !control('Authentication').disabled)
    assert.equal(calls.at(-1).action.type, 'auth_status')
    assert.equal(Object.hasOwn(calls.at(-1), 'account_basis'), false)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

async function checkoutFixture(checkout, onChanged) {
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
  const { mountGitHub } = await sourcePanel(),
    root = document.querySelector('#root'),
    calls = [],
    ok = data => ({ code: 0, data, stdout: '', stderr: '' }),
    panel = mountGitHub(root, {
      async request(request) {
        calls.push(request)
        switch (request.action.type) {
          case 'pull_requests':
            return ok([{ number: 7, title: 'Selected pull request' }])
          case 'pull_request':
            return ok({ number: 7, title: 'Checkout detail' })
          case 'checkout_pull_request':
            return checkout()
          default:
            throw new Error('Unexpected GitHub request')
        }
      },
      onChanged,
    }),
    button = text => {
      const result = [...root.querySelectorAll('button')].find(
        button => button.textContent === text
      )
      assert.ok(result, `missing button ${text}`)
      return result
    },
    ready = () => waitFor(() => !button('Authentication').disabled)
  panel.setRepository('/repo-one', 'actor-a')
  button('Pull requests').click()
  await waitFor(() => root.textContent.includes('Selected pull request'))
  await ready()
  root.querySelector('.github-items button').click()
  await waitFor(() => root.textContent.includes('Checkout detail'))
  await ready()
  return {
    root,
    panel,
    calls,
    button,
    ready,
    dispose() {
      panel.dispose()
      dom.window.close()
    },
  }
}

test('successful PR checkout refreshes once and keeps busy ownership until refresh settles', async () => {
  let changed = 0,
    finishRefresh
  const refresh = new Promise(resolve => {
      finishRefresh = resolve
    }),
    fixture = await checkoutFixture(
      async () => ({
        code: 0,
        data: null,
        stdout: 'Branch switched',
        stderr: '',
      }),
      async () => {
        changed++
        await refresh
      }
    )
  try {
    fixture.button('Check out pull request').click()
    await waitFor(() => changed === 1)
    assert(fixture.button('Authentication').disabled)
    finishRefresh()
    await fixture.ready()
    assert(fixture.root.textContent.includes('Branch switched'))
    assert.equal(changed, 1)
    assert.equal(
      fixture.calls.filter(call => call.action.type === 'checkout_pull_request')
        .length,
      1
    )
  } finally {
    finishRefresh()
    fixture.dispose()
  }
})

test('failed and cancelled PR checkouts refresh once without replacing the checkout error or replaying it', async t => {
  for (const mode of ['nonzero', 'rejected', 'cancelled']) {
    await t.test(mode, async () => {
      const original =
        mode === 'cancelled'
          ? 'Operation cancelled after switching branch'
          : 'Branch switched; tracking settings changed'
      let changed = 0
      const fixture = await checkoutFixture(
        async () => {
          if (mode !== 'nonzero') throw new Error(original)
          return { code: 1, data: null, stdout: '', stderr: original }
        },
        async () => {
          changed++
          throw new Error('Repository refresh also failed')
        }
      )
      try {
        fixture.button('Check out pull request').click()
        await waitFor(() => changed === 1)
        await fixture.ready()
        assert(fixture.root.textContent.includes(original))
        assert(
          !fixture.root.textContent.includes('Repository refresh also failed')
        )
        assert.equal(changed, 1)
        assert.equal(
          fixture.calls.filter(
            call => call.action.type === 'checkout_pull_request'
          ).length,
          1
        )
      } finally {
        fixture.dispose()
      }
    })
  }
})

test('late PR checkout success or failure cannot refresh a newer repository or account', async t => {
  for (const change of ['repository', 'account', 'dispose']) {
    await t.test(change, async () => {
      let changed = 0,
        finishCheckout
      const pending = new Promise((resolve, reject) => {
          finishCheckout =
            change === 'account'
              ? () => reject(new Error('Late checkout cancellation'))
              : () =>
                  resolve({
                    code: 0,
                    data: null,
                    stdout: 'Late checkout success',
                    stderr: '',
                  })
        }),
        fixture = await checkoutFixture(
          () => pending,
          async () => {
            changed++
          }
        )
      try {
        fixture.button('Check out pull request').click()
        if (change === 'dispose') fixture.panel.dispose()
        else
          fixture.panel.setRepository(
            change === 'repository' ? '/repo-two' : '/repo-one',
            'actor-b'
          )
        finishCheckout()
        await new Promise(resolve => setTimeout(resolve, 20))
        assert.equal(changed, 0)
        assert(!fixture.root.textContent.includes('Late checkout'))
        assert.equal(
          fixture.calls.filter(
            call => call.action.type === 'checkout_pull_request'
          ).length,
          1
        )
        if (change !== 'dispose') await fixture.ready()
      } finally {
        fixture.dispose()
      }
    })
  }
})
