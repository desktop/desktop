import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isMarkdownPreviewablePath } from '../../src/lib/is-markdown-preview-path'

describe('isMarkdownPreviewablePath', () => {
  it('returns true for .md paths', () => {
    assert.equal(isMarkdownPreviewablePath('README.md'), true)
    assert.equal(isMarkdownPreviewablePath('docs/guide.md'), true)
  })

  it('returns true for .markdown paths', () => {
    assert.equal(isMarkdownPreviewablePath('CHANGELOG.markdown'), true)
  })

  it('is case-insensitive for extensions', () => {
    assert.equal(isMarkdownPreviewablePath('ReadMe.MD'), true)
    assert.equal(isMarkdownPreviewablePath('notes.Markdown'), true)
  })

  it('returns false for non-markdown paths', () => {
    assert.equal(isMarkdownPreviewablePath('file.txt'), false)
    assert.equal(isMarkdownPreviewablePath('readme.mdx'), false)
    assert.equal(isMarkdownPreviewablePath('not-md'), false)
  })
})
