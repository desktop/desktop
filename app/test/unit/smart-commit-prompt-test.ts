import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildSmartSplitSystemPrompt } from '../../src/lib/smart-commit-prompt'

describe('buildSmartSplitSystemPrompt', () => {
  it('includes conventional commits format in the prompt', () => {
    const files = ['src/app.ts', 'src/utils.ts']
    const prompt = buildSmartSplitSystemPrompt(files)

    assert(
      prompt.includes('type(scope): description'),
      'Prompt should contain conventional commits format'
    )
  })

  it('includes all file paths in the prompt', () => {
    const files = ['src/components/Login.tsx', 'src/auth/oauth.ts', 'README.md']
    const prompt = buildSmartSplitSystemPrompt(files)

    for (const file of files) {
      assert(prompt.includes(file), `Prompt should contain file: ${file}`)
    }
  })

  it('uses conventional commits format', () => {
    const prompt = buildSmartSplitSystemPrompt(['file.ts'])

    assert(
      prompt.includes('conventional commits format'),
      'Should use conventional commits format'
    )
  })

  it('instructs the AI to return JSON with suggestions array', () => {
    const prompt = buildSmartSplitSystemPrompt(['a.ts'])

    assert(
      prompt.includes('"suggestions"'),
      'Prompt should mention suggestions key'
    )
    assert(prompt.includes('"summary"'), 'Prompt should mention summary field')
    assert(
      prompt.includes('"description"'),
      'Prompt should mention description field'
    )
    assert(prompt.includes('"files"'), 'Prompt should mention files field')
  })

  it('instructs to not omit files', () => {
    const prompt = buildSmartSplitSystemPrompt(['a.ts', 'b.ts'])

    assert(
      prompt.includes('MUST appear in at least one suggestion'),
      'Prompt should instruct no file omission'
    )
  })

  it('instructs to keep summaries under 72 characters', () => {
    const prompt = buildSmartSplitSystemPrompt(['a.ts'])

    assert(
      prompt.includes('72 characters'),
      'Prompt should mention 72-char limit'
    )
  })
})
