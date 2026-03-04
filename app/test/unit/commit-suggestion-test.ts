import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  ICommitSuggestion,
  ISmartCommitSplitResponse,
} from '../../src/models/commit-suggestion'

describe('ICommitSuggestion', () => {
  it('can create a valid commit suggestion', () => {
    const suggestion: ICommitSuggestion = {
      summary: 'feat(login): add OAuth button',
      description: 'Adds Google OAuth entry point to login screen',
      files: ['src/components/Login.tsx', 'src/auth/oauth.ts'],
      enabled: true,
    }

    assert.strictEqual(suggestion.summary, 'feat(login): add OAuth button')
    assert.strictEqual(
      suggestion.description,
      'Adds Google OAuth entry point to login screen'
    )
    assert.deepStrictEqual(suggestion.files, [
      'src/components/Login.tsx',
      'src/auth/oauth.ts',
    ])
    assert.strictEqual(suggestion.enabled, true)
  })

  it('can represent a disabled suggestion', () => {
    const suggestion: ICommitSuggestion = {
      summary: 'fix(logout): fix button not showing',
      description: '',
      files: ['src/components/Header.tsx'],
      enabled: false,
    }

    assert.strictEqual(suggestion.enabled, false)
  })

  it('supports empty description', () => {
    const suggestion: ICommitSuggestion = {
      summary: 'chore: update deps',
      description: '',
      files: ['package.json'],
      enabled: true,
    }

    assert.strictEqual(suggestion.description, '')
  })
})

describe('ISmartCommitSplitResponse', () => {
  it('can parse a valid AI response structure', () => {
    const response: ISmartCommitSplitResponse = {
      suggestions: [
        {
          summary: 'feat(login): add OAuth button',
          description: 'Adds Google OAuth entry point',
          files: ['src/components/Login.tsx', 'src/auth/oauth.ts'],
        },
        {
          summary: 'fix(logout): fix button not showing',
          description: '',
          files: ['src/components/Header.tsx'],
        },
      ],
    }

    assert.strictEqual(response.suggestions.length, 2)
    assert.strictEqual(
      response.suggestions[0].summary,
      'feat(login): add OAuth button'
    )
    assert.deepStrictEqual(response.suggestions[1].files, [
      'src/components/Header.tsx',
    ])
  })

  it('handles single suggestion response', () => {
    const response: ISmartCommitSplitResponse = {
      suggestions: [
        {
          summary: 'feat: single change across files',
          description: 'All files are related',
          files: ['a.ts', 'b.ts', 'c.ts'],
        },
      ],
    }

    assert.strictEqual(response.suggestions.length, 1)
    assert.strictEqual(response.suggestions[0].files.length, 3)
  })

  it('validates that every file appears exactly once', () => {
    const response: ISmartCommitSplitResponse = {
      suggestions: [
        {
          summary: 'feat: group A',
          description: '',
          files: ['a.ts', 'b.ts'],
        },
        {
          summary: 'fix: group B',
          description: '',
          files: ['c.ts'],
        },
      ],
    }

    // Collect all files and check no duplicates
    const allFiles = response.suggestions.flatMap(s => [...s.files])
    const uniqueFiles = new Set(allFiles)
    assert.strictEqual(
      allFiles.length,
      uniqueFiles.size,
      'No file should appear in multiple suggestions'
    )
  })
})
