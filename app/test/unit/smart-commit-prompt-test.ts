import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildSmartSplitSystemPrompt } from '../../src/lib/smart-commit-prompt'

describe('buildSmartSplitSystemPrompt', () => {
  it('includes conventional commits format by default', () => {
    const files = ['src/app.ts', 'src/utils.ts']
    const prompt = buildSmartSplitSystemPrompt(files)

    assert(
      prompt.includes('conventional commits'),
      'Prompt should contain conventional commits format'
    )
    assert(
      prompt.includes('type(scope): description'),
      'Prompt should contain format example'
    )
  })

  it('includes all file paths in the prompt', () => {
    const files = ['src/components/Login.tsx', 'src/auth/oauth.ts', 'README.md']
    const prompt = buildSmartSplitSystemPrompt(files)

    for (const file of files) {
      assert(prompt.includes(file), `Prompt should contain file: ${file}`)
    }
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

  it('uses custom format when provided', () => {
    const prompt = buildSmartSplitSystemPrompt(['a.ts'], {
      template: 'dev/fix/chore(feature) : description',
    })

    assert(
      prompt.includes('dev/fix/chore(feature) : description'),
      'Prompt should contain the custom format template'
    )
    assert(
      !prompt.includes('conventional commits'),
      'Should NOT include conventional commits when custom format is provided'
    )
    assert(
      prompt.includes('CUSTOM commit format'),
      'Should instruct AI to follow custom format'
    )
    assert(
      prompt.includes('dev/fix/chore'),
      'Should analyze the options group'
    )
  })

  it('analyzes bracket format correctly', () => {
    const prompt = buildSmartSplitSystemPrompt(['a.ts'], {
      template: '[type] [name] (scope) : description',
    })

    assert(
      prompt.includes('[type]'),
      'Should analyze bracketed segments'
    )
    assert(
      prompt.includes('(scope)'),
      'Should analyze parenthesized segments'
    )
    assert(
      prompt.includes('keep the brackets'),
      'Should instruct to keep brackets'
    )
  })

  it('falls back to conventional commits when template is empty', () => {
    const prompt = buildSmartSplitSystemPrompt(['a.ts'], {
      template: '  ',
    })

    assert(
      prompt.includes('conventional commits'),
      'Should fall back to conventional commits for empty template'
    )
  })
})
