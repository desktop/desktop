import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const web = fileURLToPath(new URL('..', import.meta.url))
async function until(check) {
  for (let n = 0; n < 200; ++n) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert(check(), 'image comparison did not settle')
}
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg=='

test('shared image models/sizing keep legacy entrypoints browser-only and handle empty sizes', async () => {
  const result = await build({
    absWorkingDir: web,
    stdin: {
      contents: [
        "export * from '../../app/src/models/diff/image'",
        "export * from '../../app/src/models/diff/image-diff'",
        "export * from '../../app/src/ui/diff/image-diffs/sizing'",
        "export * from './src/upstream/image-diffs/format'",
      ].join('\n'),
      resolveDir: web,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
  })
  const model = await import(
    `data:text/javascript;base64,${Buffer.from(
      result.outputFiles[0].text
    ).toString('base64')}`
  )
  assert.equal(
    new model.Image(new ArrayBuffer(0), png, 'image/png', 67).mediaType,
    'image/png'
  )
  assert.equal(model.ImageDiffType.Swipe, 1)
  assert.deepEqual(
    model.getAspectFitSize(
      { width: 800, height: 400 },
      { width: 200, height: 300 }
    ),
    { width: 200, height: 100 }
  )
  assert.deepEqual(
    model.getMaxFitSize(
      { width: 100, height: 200 },
      { width: 200, height: 100 },
      { width: 100, height: 100 }
    ),
    { width: 100, height: 100 }
  )
  assert.deepEqual(
    model.getAspectFitSize({ width: 0, height: 0 }, { width: 0, height: 0 }),
    { width: 0, height: 0 }
  )
  assert.equal(model.formatBytes(0), '0 B')
  assert.equal(model.sizeDifference(0, 10), 'new size')
  assert.equal(model.sizeDifference(100, 110), '10%')
  const components = await build({
    absWorkingDir: web,
    stdin: {
      contents:
        "export * from '../../app/src/ui/diff/image-diffs'; export * from '../../app/src/ui/diff/image-diffs/dds-converter'",
      resolveDir: web,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
  })
  const inputs = Object.keys(components.metafile.inputs)
  assert(
    inputs.some(path =>
      path.endsWith('src/upstream/image-diffs/modified-image-diff.tsx')
    )
  )
  assert(inputs.some(path => path.includes('node_modules/parse-dds')))
  assert(
    !inputs.some(
      path => path.includes('app/src/lib/') || path.includes('tab-bar')
    )
  )
  assert(!components.outputFiles[0].text.includes('setImmediate('))
  for (const output of Object.values(components.metafile.outputs))
    assert.deepEqual(output.imports, [])
})

test('working/staged/history image viewers expose all modes, resize, errors and single-version states', async () => {
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
  let width = 640
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    width,
    height: 360,
    top: 0,
    left: 0,
    right: width,
    bottom: 360,
  })
  const observers = new Set()
  dom.window.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback
    }
    observe() {
      observers.add(this)
    }
    disconnect() {
      observers.delete(this)
    }
  }
  const { mountDiff } = await import('../panels.js')
  const root = document.querySelector('#root')
  const image = {
    mode: '100644',
    oid: 'a'.repeat(40),
    size: Buffer.from(png, 'base64').length,
    text: null,
    image: { mime: 'image/png', data: png },
  }
  const absent = { ...image, mode: null, size: 0, image: null }
  let before = image,
    after = image,
    basis = 0
  const calls = []
  const view = mountDiff(root, {
    async request(method, parameters) {
      calls.push({ method, parameters })
      assert(
        method !== 'select_diff',
        'image viewing must not stage partial binary content'
      )
      return {
        kind: 'image',
        can_select: false,
        before,
        after,
        basis: String(++basis),
        hunks: [],
      }
    },
    async onChanged() {
      assert.fail('image controls must not mutate the repository')
    },
  })
  const button = text =>
    [...root.querySelectorAll('button')].find(item => item.textContent === text)
  function loadImages() {
    root.querySelectorAll('img').forEach((image, index) => {
      Object.defineProperty(image, 'naturalWidth', {
        configurable: true,
        value: index ? 200 : 100,
      })
      Object.defineProperty(image, 'naturalHeight', {
        configurable: true,
        value: index ? 40 : 80,
      })
      image.dispatchEvent(new dom.window.Event('load'))
    })
  }
  function range(value) {
    const input = root.querySelector('input[type=range]')
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value'
    ).set.call(input, String(value))
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  }
  async function open() {
    view.showFile('image.png', false, 'image.png', 'repo-a')
    await until(() => root.querySelector('img'))
  }
  try {
    await open()
    assert.equal(root.querySelectorAll('img').length, 2)
    assert.equal(observers.size, 1)
    assert(!root.textContent.includes('Stage selected lines'))
    loadImages()
    await until(() => root.textContent.includes('200px'))
    button('Swipe').click()
    await until(
      () =>
        root.querySelector('.image-diff-swipe .image-container')?.style
          .width === '200px'
    )
    assert.equal(button('Swipe').getAttribute('aria-pressed'), 'true')
    range(25)
    assert.equal(
      root.querySelector('.image-diff-swipe .image-diff-previous').style
        .clipPath,
      'inset(0 150px 0 0)'
    )
    button('Onion Skin').click()
    range(70)
    assert.equal(
      root.querySelector('.image-diff-onion-skin .image-diff-current').style
        .opacity,
      '0.7'
    )
    button('Difference').click()
    assert.equal(
      root.querySelector('.image-diff-current img').style.mixBlendMode,
      'difference'
    )
    width = 100
    dom.window.dispatchEvent(new dom.window.Event('resize'))
    await until(
      () => root.querySelector('.image-container')?.style.width === '100px'
    )
    root.querySelector('img').dispatchEvent(new dom.window.Event('error'))
    await until(() => root.textContent.includes('could not be decoded'))
    before = absent
    await open()
    assert(root.textContent.includes('Added'))
    assert(!button('Swipe'))
    before = image
    after = absent
    await open()
    assert(root.textContent.includes('Deleted'))
    before = { ...image, image: { mime: 'image/svg+xml', data: png } }
    after = image
    await open()
    assert.equal(root.querySelectorAll('img').length, 1)
    assert(root.textContent.includes('No image preview for this version'))
    before = image
    after = {
      ...image,
      image: { mime: 'image/png', data: 'https://example.invalid/private' },
    }
    await open()
    assert.equal(root.querySelectorAll('img').length, 1)
    assert(!root.innerHTML.includes('example.invalid'))
    before = image
    after = image
    view.showFile('image.png', true, 'image.png', 'repo-a')
    await until(() => button('Swipe'))
    assert.equal(calls.at(-1).method, 'diff_detail')
    assert.equal(calls.at(-1).parameters.staged, true)
    assert(!root.textContent.includes('Stage selected lines'))
    view.showCommit('image.png', 'c'.repeat(40), 1, 'image.png', 'repo-a')
    await until(() => button('Swipe'))
    assert.equal(calls.at(-1).method, 'commit_diff')
    assert(!root.textContent.includes('Stage selected lines'))
    view.setRepository('repo-b')
    assert.equal(root.textContent, '')
    assert.equal(observers.size, 0)
    delete dom.window.ResizeObserver
    await open()
    loadImages()
    button('Swipe').click()
    await until(
      () => root.querySelector('.image-container')?.style.width === '100px'
    )
    width = 50
    dom.window.dispatchEvent(new dom.window.Event('resize'))
    await until(
      () => root.querySelector('.image-container')?.style.width === '50px'
    )
  } finally {
    view.dispose()
    assert.equal(observers.size, 0)
    dom.window.close()
  }
})

test('legacy JPEG aliases and image mode switch keep styling, keyboard focus and labels', async () => {
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
  const compiled = await build({
    absWorkingDir: web,
    stdin: {
      contents: `import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Image } from '../../app/src/models/diff/image';
import { ImageDiffType } from '../../app/src/models/diff/image-diff';
import { ModifiedImageDiff } from '../../app/src/ui/diff/image-diffs/modified-image-diff';
export function mount(root, contents, bytes) {
  const previous = new Image(new ArrayBuffer(0), contents, 'image/jpg', bytes);
  const current = new Image(new ArrayBuffer(0), contents, 'image/jpeg', bytes);
  function Viewer() {
    const [mode, setMode] = React.useState(ImageDiffType.TwoUp);
    return <ModifiedImageDiff previous={previous} current={current} diffType={mode} onChangeDiffType={setMode} />;
  }
  ReactDOM.render(<Viewer />, root);
  return () => ReactDOM.unmountComponentAtNode(root);
}`,
      resolveDir: web,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const { mount } = await import(
    `data:text/javascript;base64,${Buffer.from(
      compiled.outputFiles[0].text
    ).toString('base64')}`
  )
  const jpeg = await readFile(
    new URL(
      '../../../app/test/fixtures/repo-with-image-changes/new-image.jpg',
      import.meta.url
    )
  )
  const root = document.querySelector('#root')
  const dispose = mount(root, jpeg.toString('base64'), jpeg.length)
  const group = root.querySelector('[aria-label="Image comparison modes"]')
  const modes = [...group.querySelectorAll('button')]
  const button = text => modes.find(item => item.textContent === text)
  function selected(label) {
    assert.equal(group.querySelectorAll('.tab-bar-item.selected').length, 1)
    assert.equal(
      group.querySelector('[aria-pressed="true"]').textContent,
      label
    )
    for (const mode of modes) {
      assert(mode.classList.contains('tab-bar-item'))
      assert.equal(mode.tabIndex, mode.textContent === label ? 0 : -1)
      assert.equal(
        mode.classList.contains('selected'),
        mode.textContent === label
      )
    }
  }
  function arrow(key, label) {
    const event = new dom.window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    })
    document.activeElement.dispatchEvent(event)
    assert.equal(event.defaultPrevented, true)
    selected(label)
    assert.equal(document.activeElement, button(label))
  }
  try {
    await until(() => root.querySelectorAll('img').length === 2)
    assert(
      [...root.querySelectorAll('img')].some(img =>
        img.src.startsWith('data:image/jpg;base64,')
      )
    )
    assert(
      [...root.querySelectorAll('img')].some(img =>
        img.src.startsWith('data:image/jpeg;base64,')
      )
    )
    assert.equal(root.querySelector('[role="alert"]'), null)
    assert(
      group.classList.contains('tab-bar') && group.classList.contains('switch')
    )
    assert.equal(group.querySelectorAll('.tab-bar-separator').length, 3)
    assert.deepEqual(
      modes.map(mode => mode.textContent),
      ['2-up', 'Swipe', 'Onion Skin', 'Difference']
    )
    selected('2-up')
    button('2-up').focus()
    arrow('ArrowLeft', 'Difference')
    arrow('ArrowRight', '2-up')
    arrow('ArrowRight', 'Swipe')
    assert.equal(
      root.querySelector('.image-diff-previous img').alt,
      'Before image'
    )
    assert.equal(
      root.querySelector('.image-diff-current img').alt,
      'After image'
    )
    const ignored = new dom.window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    button('Swipe').dispatchEvent(ignored)
    assert.equal(ignored.defaultPrevented, false)
    selected('Swipe')
    assert.equal(document.activeElement, button('Swipe'))
    button('Onion Skin').focus()
    button('Onion Skin').click()
    selected('Onion Skin')
    assert.equal(document.activeElement, button('Onion Skin'))
    arrow('ArrowRight', 'Difference')
    assert.equal(
      root.querySelector('.image-diff-previous img').alt,
      'Before image'
    )
    assert.equal(
      root.querySelector('.image-diff-current img').alt,
      'After image'
    )
  } finally {
    dispose()
    dom.window.close()
  }
})
