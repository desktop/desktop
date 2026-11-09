import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

async function until(check) {
  for (let n = 0; n < 200; ++n) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'LFS initialization did not settle')
}

test('startup preserves filters; repository setup and replacement need explicit choices', async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:9418',
  })
  globalThis.MessageChannel = undefined
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  const { mountLfsInitialization } = await import('../panels.js')
  const root = document.querySelector('#root'),
    calls = []
  let changed = 0,
    failInspection = false,
    pendingInspection = null,
    pendingInstall = null
  const services = {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'lfs_tool_status') return { available: true }
      if (method === 'lfs_status') {
        if (failInspection) throw new Error('inspection failed')
        if (pendingInspection) {
          const pending = pendingInspection
          pendingInspection = null
          return new Promise(resolve => {
            pending.resolve = resolve
          })
        }
        return {
          available: true,
          using_lfs: parameters.repository_id !== 'plain',
        }
      }
      if (pendingInstall && !parameters.skip_repo) {
        const pending = pendingInstall
        pendingInstall = null
        return new Promise(resolve => {
          pending.resolve = resolve
        })
      }
      return parameters.force
        ? { code: 0 }
        : { code: 2, stderr: '<script>existing configuration</script>' }
    },
    async onChanged() {
      ++changed
    },
  }
  let view = mountLfsInitialization(root, services)
  const button = text =>
    [...root.querySelectorAll('button')].find(item => item.textContent === text)
  const installs = () => calls.filter(call => call.method === 'lfs_install')
  const repositoryInstalls = () =>
    installs().filter(call => !call.parameters.skip_repo)
  try {
    await until(() => button('Replace global LFS filters'))
    assert.equal(root.querySelector('script'), null)
    assert(root.textContent.includes('<script>existing configuration</script>'))
    assert.deepEqual(installs()[0].parameters, {
      scope: 'global',
      skip_repo: true,
      skip_smudge: false,
      repository_id: null,
      force: false,
    })
    assert.equal(
      installs().length,
      1,
      'startup failure must not force or retry itself'
    )
    button('Replace global LFS filters').click()
    await until(() => !button('Replace global LFS filters'))
    assert.equal(installs().at(-1).parameters.force, true)
    view.setRepository('repo-a')
    await until(() => button('Initialize repository LFS'))
    assert.equal(repositoryInstalls().length, 0)
    button('Not now').click()
    view.setRepository(null)
    view.setRepository('repo-a')
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(
      !button('Initialize repository LFS'),
      'dismissal persists for this session'
    )
    view.setRepository('repo-b')
    await until(() => button('Initialize repository LFS'))
    button('Initialize repository LFS').click()
    await until(() => button('Replace existing LFS filters and hooks'))
    assert.equal(changed, 1, 'partial failure must refresh current state')
    assert.deepEqual(repositoryInstalls()[0].parameters, {
      scope: 'global',
      force: false,
      skip_repo: false,
      skip_smudge: false,
      repository_id: 'repo-b',
    })
    assert.equal(repositoryInstalls().length, 1)
    button('Replace existing LFS filters and hooks').click()
    await until(() => !button('Initialize repository LFS'))
    assert.equal(repositoryInstalls().at(-1).parameters.force, true)
    assert.equal(changed, 2)
    view.setRepository(null)
    view.setRepository('repo-b')
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(
      !button('Initialize repository LFS'),
      'successful setup stays dismissed'
    )
    assert.equal(installs().filter(call => call.parameters.skip_repo).length, 2)
    failInspection = true
    view.setRepository('repo-c')
    await until(() => button('Retry repository LFS inspection'))
    assert(!button('Replace existing LFS filters and hooks'))
    assert(!button('Initialize repository LFS'))
    failInspection = false
    button('Retry repository LFS inspection').click()
    await until(() => button('Initialize repository LFS'))
    const lateInstall = {}
    pendingInstall = lateInstall
    button('Initialize repository LFS').click()
    await until(() => lateInstall.resolve)
    view.setRepository('plain')
    lateInstall.resolve({ code: 0 })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!button('Initialize repository LFS'))
    assert.equal(
      changed,
      2,
      'old-root mutation response must not refresh the new root'
    )
    const lateInspection = {}
    pendingInspection = lateInspection
    view.setRepository('repo-d')
    await until(() => lateInspection.resolve)
    view.setRepository('plain')
    lateInspection.resolve({ available: true, using_lfs: true })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert(!button('Initialize repository LFS'))
    view.dispose()
    const missingCalls = []
    view = mountLfsInitialization(root, {
      async request(method) {
        missingCalls.push(method)
        return { available: false }
      },
      async onChanged() {},
    })
    await until(() => missingCalls.length === 1)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(missingCalls, ['lfs_tool_status'])
    assert.equal(
      root.textContent,
      '',
      'missing optional tool must not attempt setup'
    )
  } finally {
    view.dispose()
    dom.window.close()
  }
})
