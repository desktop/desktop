import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'

async function until(check) {
  for (let n = 0; n < 250; n++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'stash UI did not settle')
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
function input(root, label) {
  return [...root.querySelectorAll('label')]
    .find(item => item.textContent.includes(label))
    .querySelector('input')
}
function text(element, value) {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set.call(element, value)
  element.dispatchEvent(new window.Event('input', { bubbles: true }))
}
const id = 'a'.repeat(40),
  indexCommit = 'b'.repeat(40),
  untrackedCommit = 'c'.repeat(40)
const entry = {
  index: 0,
  oid: id,
  name: 'stash@{0}',
  message: 'On main: <script>unsafe</script> !!GitHub_Desktop<main>',
  branch: 'main',
}
const savedFiles = {
  oid: id,
  files: [
    {
      path: { bytes: [45, 255, 10] },
      display_path: 'raw file',
      status: 'A',
      commit: untrackedCommit,
      untracked: true,
    },
    {
      path: 'file',
      display_path: 'file',
      status: 'M',
      commit: id,
      untracked: false,
    },
  ],
  staged_files: [
    {
      path: 'file',
      display_path: 'staged file',
      status: 'M',
      commit: indexCommit,
      untracked: false,
    },
  ],
}

test('stash metadata preserves existing Desktop marker generation and extraction', async () => {
  const bundle = await build({
    entryPoints: [
      new URL('../src/upstream/stash-metadata.ts', import.meta.url).pathname,
    ],
    bundle: true,
    write: false,
    format: 'esm',
  })
  const metadata = await import(
    `data:text/javascript;base64,${Buffer.from(
      bundle.outputFiles[0].text
    ).toString('base64')}`
  )
  assert.equal(
    metadata.createDesktopStashMessage('branch<angles>'),
    '!!GitHub_Desktop<branch<angles>>'
  )
  assert.equal(
    metadata.extractBranchFromMessage('On main: !!GitHub_Desktop<feature/one>'),
    'feature/one'
  )
  for (const value of [
    'plain stash',
    '!!GitHub_Desktop<>',
    '!!GitHub_Desktop<main> suffix',
  ])
    assert.equal(metadata.extractBranchFromMessage(value), null)
})

test('stash UI inspects working/staged/raw files and uses reviewed explicit mutation choices', async () => {
  const dom = setup(),
    { mountStash } = await import('../panels.js'),
    root = document.querySelector('#root'),
    calls = [],
    diffs = []
  let changed = 0,
    entries = [entry],
    fail = false
  const panel = mountStash(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      if (method === 'stash_list')
        return { basis: 'list-review', entries, has_more: false }
      if (method === 'stash_files') return savedFiles
      if (method === 'stash_save') return { code: 0, created: true }
      if (method === 'stash_apply') {
        if (fail)
          throw new Error('Native stash conflicted; saved entry retained')
        return { code: 0, retained: !parameters.pop }
      }
      if (method === 'stash_move') return { code: 0, original_retained: true }
      if (method === 'stash_drop') {
        entries = []
        return { code: 0 }
      }
      throw new Error(method)
    },
    async onChanged() {
      changed++
    },
    onDiff(...args) {
      diffs.push(args)
    },
  })
  panel.setSnapshot({ root: 'repo-a', branch: 'main' })
  const inspect = async () => {
    button(root, 'Inspect stash@{0}').click()
    await until(() => button(root, 'Apply (keep stash)'))
  }
  try {
    await until(() => button(root, 'Inspect stash@{0}'))
    assert.equal(root.querySelector('script'), null)
    assert(root.textContent.includes('(current)'))
    button(root, 'Save stash').click()
    await until(() => root.textContent.includes('Local changes saved'))
    assert.deepEqual(
      calls.find(call => call.method === 'stash_save').parameters,
      { message: '', desktop: true, include_untracked: true }
    )
    await inspect()
    button(root, 'A raw file (untracked)').click()
    assert.deepEqual(diffs[0], [
      { bytes: [45, 255, 10] },
      untrackedCommit,
      0,
      'raw file',
      'repo-a',
    ])
    button(root, 'Saved staged files').click()
    button(root, 'M staged file').click()
    assert.equal(diffs[1][1], indexCommit)
    input(root, 'Restore the saved index').click()
    button(root, 'Apply (keep stash)').click()
    await until(() =>
      root.textContent.includes('Stash applied; saved entry kept')
    )
    assert.deepEqual(
      calls.find(call => call.method === 'stash_apply').parameters,
      {
        oid: id,
        index: 0,
        basis: 'list-review',
        restore_index: true,
        pop: false,
      }
    )
    await inspect()
    button(root, 'Pop stash…').click()
    assert(button(root, 'Apply and pop stash'))
    button(root, 'Keep stash').click()
    assert.equal(calls.filter(call => call.method === 'stash_apply').length, 1)
    button(root, 'Pop stash…').click()
    button(root, 'Apply and pop stash').click()
    await until(() => root.textContent.includes('Stash applied and removed'))
    await inspect()
    text(input(root, 'Associate stash with branch'), 'feature/moved')
    button(root, 'Move stash to branch').click()
    await until(() =>
      root.textContent.includes(
        'Replacement saved; original entry also retained'
      )
    )
    assert.deepEqual(
      calls.find(call => call.method === 'stash_move').parameters,
      { oid: id, index: 0, basis: 'list-review', branch: 'feature/moved' }
    )
    await inspect()
    fail = true
    const before = changed
    button(root, 'Apply (keep stash)').click()
    await until(() => root.textContent.includes('Native stash conflicted'))
    assert.equal(changed, before + 1)
    assert(button(root, 'Inspect stash@{0}'))
    await inspect()
    button(root, 'Remove stash…').click()
    assert(!calls.some(call => call.method === 'stash_drop'))
    button(root, 'Remove saved stash entry').click()
    await until(() => root.textContent.includes('Stash entry removed'))
    assert(root.textContent.includes('No saved stashes.'))
    assert.deepEqual(
      calls.find(call => call.method === 'stash_drop').parameters,
      { oid: id, index: 0, basis: 'list-review' }
    )
    panel.setEnabled(false)
    assert(button(root, 'Save stash').disabled)
  } finally {
    panel.dispose()
    dom.window.close()
  }
})

test('stash replies and mutation errors cannot overwrite a changed repository', async () => {
  const dom = setup(),
    { mountStash } = await import('../panels.js'),
    root = document.querySelector('#root')
  let late,
    active = 'repo-a',
    changed = 0,
    lateApply
  const panel = mountStash(root, {
    async request(method) {
      if (method === 'stash_list') {
        if (active === 'repo-a')
          return new Promise(resolve => {
            late = resolve
          })
        return { basis: 'repo-b-review', entries: [], has_more: true }
      }
      if (method === 'stash_files') return savedFiles
      if (method === 'stash_apply')
        return new Promise(resolve => {
          lateApply = resolve
        })
      throw new Error(method)
    },
    async onChanged() {
      changed++
    },
    onDiff() {},
  })
  try {
    panel.setSnapshot({ root: 'repo-a', branch: 'main' })
    await until(() => late)
    active = 'repo-b'
    panel.setSnapshot({ root: 'repo-b', branch: null })
    await until(() => root.textContent.includes('No saved stashes.'))
    late({ basis: 'stale', entries: [entry], has_more: false })
    await new Promise(resolve => setTimeout(resolve, 15))
    assert(!root.textContent.includes('unsafe'))
    assert(root.textContent.includes('Showing the newest 1000'))
    active = 'repo-a'
    late = undefined
    panel.setSnapshot({ root: 'repo-a', branch: 'main' })
    await until(() => late)
    late({ basis: 'review-a', entries: [entry], has_more: false })
    await until(() => button(root, 'Inspect stash@{0}'))
    button(root, 'Inspect stash@{0}').click()
    await until(() => button(root, 'Apply (keep stash)'))
    button(root, 'Apply (keep stash)').click()
    await until(() => lateApply)
    active = 'repo-b'
    panel.setSnapshot({ root: 'repo-b', branch: null })
    lateApply({ code: 0, retained: true })
    await until(() => changed === 1)
    await new Promise(resolve => setTimeout(resolve, 15))
    assert(!root.textContent.includes('Stash applied'))
    panel.setSnapshot(null)
    assert.equal(root.textContent, '')
  } finally {
    panel.dispose()
    dom.window.close()
  }
})
