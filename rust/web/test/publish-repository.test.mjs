import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

let modulePromise
function source() {
  modulePromise ??= build({
    stdin: {
      contents: `import * as React from 'react'; import * as ReactDOM from 'react-dom'; import {PublishRepository} from './publish-repository'; export {sanitizedRepositoryName} from './upstream/sanitized-repository-name';
      export function mount(container, services) {let root='first', basis='one', busy=false;
        function render(){ReactDOM.render(React.createElement(PublishRepository,{root,accountBasis:basis,busy,onBusy(value){busy=value;render()},request:services.request,onChanged:services.onChanged}),container)}
        render();return {setRoot(value){root=value;busy=false;render()},setBasis(value){basis=value;render()},dispose(){ReactDOM.unmountComponentAtNode(container)}}}`,
      resolveDir: fileURLToPath(new URL('../src', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then(result =>
    import(
      `data:text/javascript;base64,${Buffer.from(
        result.outputFiles[0].text
      ).toString('base64')}`
    )
  )
  return modulePromise
}
async function until(check) {
  for (let n = 0; n < 300; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(check(), 'DOM condition did not become true')
}
function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}
function setup() {
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
  const root = document.querySelector('#root')
  function button(text) {
    return [...root.querySelectorAll('button')].find(
      item => item.textContent === text
    )
  }
  function field(text) {
    return [...root.querySelectorAll('label')]
      .find(item => item.textContent.trim().startsWith(text))
      ?.querySelector('input,select')
  }
  function input(label, value) {
    const node = field(label)
    assert(node, label)
    if (node.tagName === 'SELECT') node.value = value
    else
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      ).set.call(node, value)
    node.dispatchEvent(
      new dom.window.Event(node.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      })
    )
  }
  return { dom, root, button, field, input }
}
const accounts = [
  { host: 'github.com', login: 'Alice', state: 'success' },
  { host: 'github.com', login: 'Bob', state: 'success' },
]
const options = {
  host: 'github.com',
  name: 'local repo',
  description: 'existing description',
  private: true,
  accounts,
  assignment: { mode: 'none' },
  origin_exists: false,
  status: 'available',
  reason: null,
}

test('shared name sanitizer preserves legacy emoji, leading dashes, dots and invalid characters', async () => {
  const built = await build({
    entryPoints: [
      fileURLToPath(
        new URL('../src/upstream/sanitized-repository-name.ts', import.meta.url)
      ),
    ],
    bundle: true,
    write: false,
    format: 'esm',
  })
  const { sanitizedRepositoryName } = await import(
    `data:text/javascript;base64,${Buffer.from(
      built.outputFiles[0].text
    ).toString('base64')}`
  )
  for (const [input, expected] of [
    ['this-is-fine', 'this-is-fine'],
    ['.this..is\\not fine:yo?|is-it', '.this..is-not-fine-yo--is-it'],
    ['--but-can-still-keep-the-rest', '--but-can-still-keep-the-rest'],
    ['.first.dot.is.ok', '.first.dot.is.ok'],
    ['hello🐓world-repo', 'hello-world-repo'],
  ])
    assert.equal(sanitizedRepositoryName(input), expected)
})

test('review requires an explicit account and ignores stale organizations', async () => {
  const { dom, root, button, field, input } = setup(),
    { mount } = await source(),
    calls = [],
    slow = deferred()
  const panel = mount(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'publish_context') return options
      if (method === 'publish_organizations') {
        if (parameters.target.login === 'Alice') return slow.promise
        return {
          organizations: [{ login: 'zeta' }, { login: 'Acme' }],
          actor: { login: 'Bob', id: 2 },
          status: 'available',
          reason: null,
        }
      }
      if (method === 'publish_preview')
        return {
          basis: 'review-basis',
          can_apply: true,
          reason: null,
          actor: { login: 'Bob', id: 2 },
          owner: { login: 'Acme', id: 42, kind: 'organization' },
          pushes: [{ branch: 'main', oid: 'abc123', role: 'current' }],
          push_status: 'planned',
        }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
  })
  try {
    button('Load publishing options').click()
    await until(() => field('Account'))
    assert.equal(field('Account').value, '')
    assert.equal(field('Name').value, 'local repo')
    assert.equal(field('Description').value, 'existing description')
    assert.equal(field('Keep this code private').checked, true)
    assert.equal(button('Review publication').disabled, true)
    const alice = JSON.stringify(['github.com', 'alice']),
      bob = JSON.stringify(['github.com', 'bob'])
    input('Account', alice)
    await until(() =>
      calls.some(
        call =>
          call.method === 'publish_organizations' &&
          call.parameters.target.login === 'Alice'
      )
    )
    input('Account', bob)
    await until(
      () => field('Organization') && field('Organization').options.length === 3
    )
    slow.resolve({
      organizations: [{ login: 'wrong-account' }],
      actor: { login: 'Alice', id: 1 },
      status: 'available',
      reason: null,
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    assert(!root.textContent.includes('wrong-account'))
    assert.deepEqual(
      [...field('Organization').options].map(option => option.textContent),
      ['None', 'Acme', 'zeta']
    )
    input('Organization', 'Acme')
    input('Name', 'my repo')
    input('Description', 'literal $(text)')
    await until(() => root.textContent.includes('Will be created as my-repo'))
    button('Review publication').click()
    await until(() => root.querySelector('[aria-label="Publication review"]'))
    assert.deepEqual(
      calls.find(call => call.method === 'publish_preview').parameters.request,
      {
        host: 'github.com',
        target: { mode: 'assigned', host: 'github.com', login: 'Bob' },
        owner: 'Acme',
        name: 'my-repo',
        description: 'literal $(text)',
        private: true,
      }
    )
    assert(root.textContent.includes('Acme/my-repo'))
    assert(root.textContent.includes('Publication is not available yet'))
    assert(!button('Publish repository'))
    assert(button('Load publication history'))
    assert(
      !calls.some(call =>
        ['publish', 'publish_history', 'acknowledge_publish'].includes(
          call.method
        )
      )
    )
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('effective credentials are selectable, and old repository replies cannot change the new draft', async () => {
  const { dom, root, button, field, input } = setup(),
    { mount } = await source(),
    pending = deferred(),
    calls = []
  let first = true
  const panel = mount(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'publish_context') {
        if (first) {
          first = false
          return pending.promise
        }
        return {
          ...options,
          name: 'new-root',
          accounts: [],
          assignment: { mode: 'effective' },
        }
      }
      if (method === 'publish_organizations')
        return {
          organizations: [],
          actor: { login: 'Alice', id: 1 },
          status: 'available',
          reason: null,
        }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
  })
  try {
    button('Load publishing options').click()
    panel.setRoot('second')
    button('Load publishing options').click()
    await until(() => field('Name')?.value === 'new-root')
    assert.equal(field('Account').value, 'effective')
    await until(() =>
      calls.some(call => call.method === 'publish_organizations')
    )
    assert.deepEqual(
      calls.find(call => call.method === 'publish_organizations').parameters,
      { host: 'github.com', target: { mode: 'effective' } }
    )
    pending.resolve({ ...options, name: 'old-root' })
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(field('Name').value, 'new-root')
    assert.equal(field('Account').value, 'effective')
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('preview shows the backend plan but cannot publish while writes are unavailable', async () => {
  const { dom, root, button, field } = setup(),
    { mount } = await source(),
    calls = []
  const panel = mount(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'publish_context')
        return {
          ...options,
          accounts: [accounts[0]],
          assignment: { mode: 'effective' },
        }
      if (method === 'publish_organizations')
        return {
          organizations: [],
          actor: { login: 'Alice', id: 1 },
          status: 'available',
          reason: null,
        }
      if (method === 'publish_preview')
        return {
          basis: 'review-basis',
          can_apply: false,
          reason: 'Publication is not available yet',
          actor: { login: 'Alice', id: 1 },
          owner: { login: 'Alice', id: 1, kind: 'personal' },
          pushes: [
            { branch: 'main', oid: 'abc123', role: 'default' },
            { branch: 'topic', oid: 'def456', role: 'current' },
          ],
          push_status: 'planned',
        }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
  })
  try {
    button('Load publishing options').click()
    await until(() => field('Account'))
    assert.equal(field('Account').value, 'effective')
    await until(() => !button('Review publication').disabled)
    button('Review publication').click()
    await until(() => root.querySelector('[aria-label="Publication review"]'))
    assert(!button('Publish repository'))
    assert(root.textContent.includes('Alice/local-repo'))
    assert(root.textContent.includes('default: main (abc123)'))
    assert(root.textContent.includes('current: topic (def456)'))
    assert(root.textContent.includes('Publication is not available yet'))
    assert.equal(calls.filter(call => call.method === 'publish').length, 0)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('an unavailable assigned account is not replaced by another stored account', async () => {
  const { dom, root, button, field } = setup(),
    { mount } = await source(),
    calls = []
  const panel = mount(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'publish_context')
        return {
          ...options,
          accounts: [accounts[1]],
          assignment: { mode: 'assigned', host: 'github.com', login: 'Alice' },
        }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
  })
  try {
    button('Load publishing options').click()
    await until(() => field('Account'))
    assert.equal(field('Account').value, '')
    assert.equal(button('Review publication').disabled, true)
    assert(!calls.some(call => call.method === 'publish_organizations'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('personal owner is the verified effective actor and preview waits for it', async () => {
  const { dom, root, button, field } = setup(),
    { mount } = await source(),
    pending = deferred(),
    calls = []
  const panel = mount(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'publish_context')
        return { ...options, accounts: [], assignment: { mode: 'effective' } }
      if (method === 'publish_organizations') return pending.promise
      if (method === 'publish_preview')
        return {
          basis: 'basis',
          can_apply: false,
          reason: 'Not implemented',
          actor: { login: 'verified-user', id: 15 },
          owner: { login: 'verified-user', id: 15, kind: 'personal' },
          pushes: [],
          push_status: 'unborn',
        }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
  })
  try {
    button('Load publishing options').click()
    await until(() => field('Account'))
    assert.equal(field('Account').value, 'effective')
    assert.equal(button('Review publication').disabled, true)
    pending.resolve({
      organizations: [],
      actor: { login: 'verified-user', id: 15 },
      status: 'available',
      reason: null,
    })
    await until(() => !button('Review publication').disabled)
    button('Review publication').click()
    await until(() => root.querySelector('[aria-label="Publication review"]'))
    assert.deepEqual(
      calls.find(call => call.method === 'publish_preview').parameters,
      {
        request: {
          host: 'github.com',
          target: { mode: 'effective' },
          owner: 'verified-user',
          name: 'local-repo',
          description: 'existing description',
          private: true,
        },
      }
    )
    assert(!button('Publish repository'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('publication history explains uncertain phases and acknowledges only explicitly', async () => {
  const { dom, root, button } = setup(),
    { mount } = await source(),
    calls = [],
    id = '12345678-1234-4234-8234-123456789abc',
    unreadable = '12345678-1234-4234-8234-123456789abd'
  let acknowledged = false
  const panel = mount(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      const row = {
        id,
        phase: 'creation_unknown',
        url: null,
        error: null,
        acknowledged,
      }
      if (method === 'publish_history')
        return {
          receipts: [
            row,
            {
              id: unreadable,
              phase: 'unreadable',
              url: null,
              error: 'Cannot read publication receipt',
              acknowledged: false,
            },
          ],
        }
      if (method === 'acknowledge_publish') {
        acknowledged = true
        return { receipt: { ...row, acknowledged: true } }
      }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
  })
  try {
    assert(root.textContent.includes('A repository URL may not be available'))
    assert(root.textContent.includes('does not retry publication'))
    button('Load publication history').click()
    await until(() => button('Acknowledge ' + id))
    assert(root.textContent.includes('creation_unknown'))
    assert(root.textContent.includes('Inspect GitHub before acknowledging'))
    assert(root.textContent.includes('Repository URL is unavailable'))
    assert(root.textContent.includes('private recovery metadata'))
    assert(!button('Acknowledge ' + unreadable))
    assert(!calls.some(call => call.method === 'acknowledge_publish'))
    button('Acknowledge ' + id).click()
    await until(() => root.textContent.includes('Receipt acknowledged.'))
    assert.deepEqual(
      calls
        .filter(call => call.method === 'acknowledge_publish')
        .map(call => call.parameters),
      [{ receipt_id: id }]
    )
    assert(root.textContent.includes('Reviewed.'))
    assert(!button('Acknowledge ' + id))
    assert(!calls.some(call => call.method === 'publish'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('lost acknowledgement invalidates history without replay and repository or account changes fence replies', async () => {
  const { dom, root, button } = setup(),
    { mount } = await source(),
    calls = [],
    pending = deferred(),
    pendingRoot = deferred(),
    id = '12345678-1234-4234-8234-123456789abc'
  let lost = true,
    delayHistory = false
  const row = {
    id,
    phase: 'origin_unknown',
    url: null,
    error: null,
    acknowledged: false,
  }
  const panel = mount(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'publish_history')
        return delayHistory === 2
          ? pendingRoot.promise
          : delayHistory
          ? pending.promise
          : { receipts: [row] }
      if (method === 'acknowledge_publish' && lost) {
        lost = false
        throw new Error('lost response')
      }
      throw new Error('Unexpected request: ' + method)
    },
    async onChanged() {},
  })
  try {
    button('Load publication history').click()
    await until(() => button('Acknowledge ' + id))
    button('Acknowledge ' + id).click()
    await until(() =>
      root.textContent.includes('Acknowledgement status is uncertain')
    )
    assert(!button('Acknowledge ' + id))
    assert.equal(
      calls.filter(call => call.method === 'acknowledge_publish').length,
      1
    )
    delayHistory = true
    button('Load publication history').click()
    await until(
      () => calls.filter(call => call.method === 'publish_history').length === 2
    )
    panel.setBasis('two')
    pending.resolve({ receipts: [row] })
    await new Promise(resolve => setTimeout(resolve, 40))
    assert(!button('Acknowledge ' + id))
    assert(!root.textContent.includes('origin_unknown'))
    assert.equal(
      calls.filter(call => call.method === 'acknowledge_publish').length,
      1
    )
    delayHistory = 2
    button('Load publication history').click()
    await until(
      () => calls.filter(call => call.method === 'publish_history').length === 3
    )
    panel.setRoot('second')
    pendingRoot.resolve({ receipts: [row] })
    await new Promise(resolve => setTimeout(resolve, 40))
    assert(!button('Acknowledge ' + id))
    assert(!root.textContent.includes('origin_unknown'))
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
