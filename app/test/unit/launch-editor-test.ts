import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as os from 'os'
import * as Path from 'path'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import {
  isVSCodeEditor,
  resolveEditorTarget,
} from '../../src/lib/editors/launch'
import { FoundEditor } from '../../src/lib/editors/shared'

describe('isVSCodeEditor', () => {
  it('returns true for VS Code and derivatives', () => {
    assert.strictEqual(isVSCodeEditor('Visual Studio Code'), true)
    assert.strictEqual(isVSCodeEditor('Visual Studio Code (Insiders)'), true)
    assert.strictEqual(isVSCodeEditor('VSCodium'), true)
    assert.strictEqual(isVSCodeEditor('VSCodium (Insiders)'), true)
    assert.strictEqual(isVSCodeEditor('Cursor'), true)
    assert.strictEqual(isVSCodeEditor('Windsurf'), true)
  })

  it('returns false for non-VS Code editors', () => {
    assert.strictEqual(isVSCodeEditor('Sublime Text'), false)
    assert.strictEqual(isVSCodeEditor('Atom'), false)
    assert.strictEqual(isVSCodeEditor('Notepad++'), false)
    assert.strictEqual(isVSCodeEditor('IntelliJ IDEA'), false)
  })
})

describe('resolveEditorTarget', () => {
  const vsCodeEditor: FoundEditor = {
    editor: 'Visual Studio Code',
    path: '/path/to/code',
  }

  const otherEditor: FoundEditor = {
    editor: 'Sublime Text',
    path: '/path/to/sublime',
  }

  it('returns original path for non-VS Code editors even if workspace exists', async () => {
    const dir = await mkdtemp(Path.join(os.tmpdir(), 'ghd-test-'))
    try {
      await writeFile(Path.join(dir, 'test.code-workspace'), '{}')
      const target = await resolveEditorTarget(dir, otherEditor)
      assert.strictEqual(target, dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns workspace file path when a single .code-workspace exists in directory', async () => {
    const dir = await mkdtemp(Path.join(os.tmpdir(), 'ghd-test-'))
    try {
      const workspacePath = Path.join(dir, 'project.code-workspace')
      await writeFile(workspacePath, '{}')
      const target = await resolveEditorTarget(dir, vsCodeEditor)
      assert.strictEqual(target, workspacePath)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns original path when no .code-workspace exists', async () => {
    const dir = await mkdtemp(Path.join(os.tmpdir(), 'ghd-test-'))
    try {
      await writeFile(Path.join(dir, 'README.md'), '# Hello')
      const target = await resolveEditorTarget(dir, vsCodeEditor)
      assert.strictEqual(target, dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns original path when multiple .code-workspace files exist', async () => {
    const dir = await mkdtemp(Path.join(os.tmpdir(), 'ghd-test-'))
    try {
      await writeFile(Path.join(dir, 'a.code-workspace'), '{}')
      await writeFile(Path.join(dir, 'b.code-workspace'), '{}')
      const target = await resolveEditorTarget(dir, vsCodeEditor)
      assert.strictEqual(target, dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns original file path when target is a file, not a directory', async () => {
    const dir = await mkdtemp(Path.join(os.tmpdir(), 'ghd-test-'))
    try {
      const filePath = Path.join(dir, 'README.md')
      await writeFile(filePath, '# Hello')
      await writeFile(Path.join(dir, 'project.code-workspace'), '{}')
      const target = await resolveEditorTarget(filePath, vsCodeEditor)
      assert.strictEqual(target, filePath)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('ignores directories named with .code-workspace extension', async () => {
    const dir = await mkdtemp(Path.join(os.tmpdir(), 'ghd-test-'))
    try {
      await mkdir(Path.join(dir, 'folder.code-workspace'))
      const target = await resolveEditorTarget(dir, vsCodeEditor)
      assert.strictEqual(target, dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('ignores hidden files ending with .code-workspace', async () => {
    const dir = await mkdtemp(Path.join(os.tmpdir(), 'ghd-test-'))
    try {
      await writeFile(Path.join(dir, '._backup.code-workspace'), '{}')
      const target = await resolveEditorTarget(dir, vsCodeEditor)
      assert.strictEqual(target, dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('handles non-existent paths gracefully', async () => {
    const nonExistentPath = Path.join(
      os.tmpdir(),
      'non-existent-dir-' + Date.now()
    )
    const target = await resolveEditorTarget(nonExistentPath, vsCodeEditor)
    assert.strictEqual(target, nonExistentPath)
  })
})
