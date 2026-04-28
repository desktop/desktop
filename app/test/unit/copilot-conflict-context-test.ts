import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  extractConflictHunks,
  formatConflictContextForPrompt,
  ICopilotConflictContext,
  IConflictCommitContext,
} from '../../src/lib/copilot-conflict-context'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

function makeCommit(shortSha: string, summary: string): Commit {
  const identity = new CommitIdentity('test', 'test@test.com', new Date())
  return new Commit(
    shortSha.padEnd(40, '0'),
    shortSha,
    summary,
    '',
    identity,
    identity,
    [],
    [],
    []
  )
}

describe('copilot-conflict-context', () => {
  describe('extractConflictHunks', () => {
    it('handles CRLF line endings (Windows)', () => {
      const content = [
        'line before',
        '<<<<<<< HEAD',
        'our change',
        '=======',
        'their change',
        '>>>>>>> feature',
        'line after',
      ].join('\r\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].oursContent, 'our change')
      assert.equal(hunks[0].theirsContent, 'their change')
      assert.equal(hunks[0].baseContent, null)
    })

    it('does not bleed conflict markers into context lines', () => {
      const content = [
        'start',
        '<<<<<<< HEAD',
        'ours-1',
        '=======',
        'theirs-1',
        '>>>>>>> feature',
        'middle',
        '<<<<<<< HEAD',
        'ours-2',
        '=======',
        'theirs-2',
        '>>>>>>> feature',
        'end',
      ].join('\n')

      const hunks = extractConflictHunks(content, 5)

      assert.equal(hunks.length, 2)
      // First hunk contextAfter should stop before the next <<<<<<< marker
      assert.equal(hunks[0].contextAfter, 'middle')
      assert.ok(!hunks[0].contextAfter.includes('<<<<<<<'))
      // Second hunk contextBefore should stop after the previous >>>>>>> marker
      assert.equal(hunks[1].contextBefore, 'middle')
      assert.ok(!hunks[1].contextBefore.includes('>>>>>>>'))
    })

    it('extracts a standard two-way conflict hunk', () => {
      const content = [
        'line before',
        '<<<<<<< HEAD',
        'our change',
        '=======',
        'their change',
        '>>>>>>> feature',
        'line after',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].oursContent, 'our change')
      assert.equal(hunks[0].theirsContent, 'their change')
      assert.equal(hunks[0].baseContent, null)
    })

    it('extracts a diff3 three-way conflict hunk', () => {
      const content = [
        'unchanged',
        '<<<<<<< HEAD',
        'our version',
        '||||||| merged common ancestors',
        'original version',
        '=======',
        'their version',
        '>>>>>>> feature',
        'more unchanged',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].oursContent, 'our version')
      assert.equal(hunks[0].baseContent, 'original version')
      assert.equal(hunks[0].theirsContent, 'their version')

      // Multi-line base content is preserved
      const multiLineBase = [
        '<<<<<<< HEAD',
        'ours',
        '||||||| base',
        'base line 1',
        'base line 2',
        '=======',
        'theirs',
        '>>>>>>> feature',
      ].join('\n')

      const hunks2 = extractConflictHunks(multiLineBase)
      assert.equal(hunks2.length, 1)
      assert.equal(hunks2[0].baseContent, 'base line 1\nbase line 2')
    })

    it('extracts multiple conflict hunks from one file', () => {
      const content = [
        'start',
        '<<<<<<< HEAD',
        'ours-1',
        '=======',
        'theirs-1',
        '>>>>>>> feature',
        'middle',
        '<<<<<<< HEAD',
        'ours-2',
        '=======',
        'theirs-2',
        '>>>>>>> feature',
        'end',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 2)
      assert.equal(hunks[0].oursContent, 'ours-1')
      assert.equal(hunks[0].theirsContent, 'theirs-1')
      assert.equal(hunks[1].oursContent, 'ours-2')
      assert.equal(hunks[1].theirsContent, 'theirs-2')
    })

    it('returns an empty array when no conflict markers are present', () => {
      const content = 'just a normal file\nwith no conflicts\n'

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 0)
    })

    it('includes surrounding context lines and respects contextLines parameter', () => {
      const content = [
        'line 1',
        'line 2',
        'line 3',
        'line 4',
        '<<<<<<< HEAD',
        'our change',
        '=======',
        'their change',
        '>>>>>>> feature',
        'line 5',
        'line 6',
        'line 7',
        'line 8',
      ].join('\n')

      // Default-like: 3 context lines
      const hunks3 = extractConflictHunks(content, 3)
      assert.equal(hunks3.length, 1)
      assert.equal(hunks3[0].contextBefore, 'line 2\nline 3\nline 4')
      assert.equal(hunks3[0].contextAfter, 'line 5\nline 6\nline 7')

      // Custom: 1 context line
      const hunks1 = extractConflictHunks(content, 1)
      assert.equal(hunks1.length, 1)
      assert.equal(hunks1[0].contextBefore, 'line 4')
      assert.equal(hunks1[0].contextAfter, 'line 5')
    })

    it('handles zero context lines', () => {
      const content = [
        'line before',
        '<<<<<<< HEAD',
        'ours',
        '=======',
        'theirs',
        '>>>>>>> feature',
        'line after',
      ].join('\n')

      const hunks = extractConflictHunks(content, 0)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].contextBefore, '')
      assert.equal(hunks[0].contextAfter, '')
    })

    it('handles conflict markers at the start of the file', () => {
      const content = [
        '<<<<<<< HEAD',
        'ours',
        '=======',
        'theirs',
        '>>>>>>> feature',
        'after',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].contextBefore, '')
      assert.equal(hunks[0].oursContent, 'ours')
      assert.equal(hunks[0].theirsContent, 'theirs')
      assert.equal(hunks[0].contextAfter, 'after')
    })

    it('handles conflict markers at the end of the file', () => {
      const content = [
        'before',
        '<<<<<<< HEAD',
        'ours',
        '=======',
        'theirs',
        '>>>>>>> feature',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].contextBefore, 'before')
      assert.equal(hunks[0].oursContent, 'ours')
      assert.equal(hunks[0].theirsContent, 'theirs')
      assert.equal(hunks[0].contextAfter, '')
    })

    it('handles multi-line content in each section', () => {
      const content = [
        '<<<<<<< HEAD',
        'our line 1',
        'our line 2',
        'our line 3',
        '=======',
        'their line 1',
        'their line 2',
        '>>>>>>> feature',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].oursContent, 'our line 1\nour line 2\nour line 3')
      assert.equal(hunks[0].theirsContent, 'their line 1\ntheir line 2')
    })

    it('handles empty ours content', () => {
      const content = [
        '<<<<<<< HEAD',
        '=======',
        'their change',
        '>>>>>>> feature',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].oursContent, '')
      assert.equal(hunks[0].theirsContent, 'their change')
    })

    it('handles empty theirs content', () => {
      const content = [
        '<<<<<<< HEAD',
        'our change',
        '=======',
        '>>>>>>> feature',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(hunks[0].oursContent, 'our change')
      assert.equal(hunks[0].theirsContent, '')
    })

    it('does not treat markers inside content as boundaries', () => {
      // Conflict markers must start at column 0 with exactly 7 characters
      const content = [
        '<<<<<<< HEAD',
        'const s = "<<<<<<< not a real marker"',
        '=======',
        'const s = ">>>>>>> also not real"',
        '>>>>>>> feature',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 1)
      assert.equal(
        hunks[0].oursContent,
        'const s = "<<<<<<< not a real marker"'
      )
      assert.equal(hunks[0].theirsContent, 'const s = ">>>>>>> also not real"')
    })

    it('skips a malformed hunk with no closing marker', () => {
      const content = [
        '<<<<<<< HEAD',
        'ours',
        '=======',
        'theirs without closing marker',
      ].join('\n')

      const hunks = extractConflictHunks(content)

      assert.equal(hunks.length, 0)
    })
  })

  describe('formatConflictContextForPrompt', () => {
    it('formats a single file with one conflict', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'src/app.ts',
            hunks: [
              {
                oursContent: 'const x = 1',
                theirsContent: 'const x = 2',
                baseContent: null,
                contextBefore: 'import foo',
                contextAfter: 'export default',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      assert.ok(result.includes('"main" (ours)'))
      assert.ok(result.includes('"feature" (theirs)'))
      assert.ok(result.includes('## File: src/app.ts'))
      assert.ok(result.includes('Conflict 1 of 1'))
      assert.ok(result.includes('const x = 1'))
      assert.ok(result.includes('const x = 2'))
      assert.ok(result.includes('import foo'))
      assert.ok(result.includes('export default'))
      // Should not include base section for two-way conflict
      assert.ok(!result.includes('Base (common ancestor)'))
    })

    it('uses language from file extension in code fences', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'src/app.ts',
            hunks: [
              {
                oursContent: 'ours',
                theirsContent: 'theirs',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      assert.ok(result.includes('```ts'))
      assert.ok(!result.includes('Language hint'))
    })

    it('formats multiple files with multiple conflicts', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'src/a.ts',
            hunks: [
              {
                oursContent: 'a-ours-1',
                theirsContent: 'a-theirs-1',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
              {
                oursContent: 'a-ours-2',
                theirsContent: 'a-theirs-2',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
          {
            path: 'src/b.tsx',
            hunks: [
              {
                oursContent: 'b-ours',
                theirsContent: 'b-theirs',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      assert.ok(result.includes('## File: src/a.ts'))
      assert.ok(result.includes('## File: src/b.tsx'))
      assert.ok(result.includes('Conflict 1 of 2'))
      assert.ok(result.includes('Conflict 2 of 2'))
      assert.ok(result.includes('a-ours-1'))
      assert.ok(result.includes('a-ours-2'))
      assert.ok(result.includes('b-ours'))
    })

    it('includes base content for diff3 conflicts', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'file.ts',
            hunks: [
              {
                oursContent: 'ours',
                theirsContent: 'theirs',
                baseContent: 'original',
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      assert.ok(result.includes('Base (common ancestor)'))
      assert.ok(result.includes('original'))
    })

    it('uses empty language for extensionless files', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'Makefile',
            hunks: [
              {
                oursContent: 'ours',
                theirsContent: 'theirs',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      assert.ok(result.includes('## File: Makefile'))
      // Code fences should just be ``` with no language
      assert.ok(result.includes('```\n'))
    })

    it('omits context before/after blocks when empty', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'file.ts',
            hunks: [
              {
                oursContent: 'ours',
                theirsContent: 'theirs',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      assert.ok(!result.includes('Context before'))
      assert.ok(!result.includes('Context after'))
    })

    it('renders skipped files with a reason instead of hunks', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'src/big-file.ts',
            hunks: [],
            skippedReason: 'File exceeds 1MB size limit',
          },
          {
            path: 'src/normal.ts',
            hunks: [
              {
                oursContent: 'ours',
                theirsContent: 'theirs',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      // Skipped file should show heading and reason
      assert.ok(result.includes('## File: src/big-file.ts'))
      assert.ok(result.includes('Skipped: File exceeds 1MB size limit'))
      // Normal file should still render hunks
      assert.ok(result.includes('## File: src/normal.ts'))
      assert.ok(result.includes('ours'))
    })
  })

  describe('formatConflictContextForPrompt with enrichment', () => {
    const baseContext: ICopilotConflictContext = {
      ourLabel: 'main',
      theirLabel: 'feature/uuids',
      files: [
        {
          path: 'src/user.ts',
          hunks: [
            {
              oursContent: 'id: number',
              theirsContent: 'id: string',
              baseContent: null,
              contextBefore: '',
              contextAfter: '',
            },
          ],
        },
      ],
    }

    function makePullRequest(
      prNumber: number,
      title: string,
      body: string
    ): PullRequest {
      const ghRepo = gitHubRepoFixture({ owner: 'owner', name: 'repo' })
      return new PullRequest(
        new Date(),
        title,
        prNumber,
        new PullRequestRef('refs/heads/feature', 'aaa', ghRepo),
        new PullRequestRef('refs/heads/main', 'bbb', ghRepo),
        'author',
        false,
        body
      )
    }

    it('includes commit context in output', () => {
      const commitCtx: IConflictCommitContext = {
        ourCommits: [
          makeCommit('abc1234', 'Add numeric IDs'),
          makeCommit('def5678', 'Update schema'),
        ],
        theirCommits: [makeCommit('111aaaa', 'Add UUID support')],
      }

      const result = formatConflictContextForPrompt(
        baseContext,
        commitCtx,
        null
      )

      assert.ok(result.includes('## Recent Commits'))
      assert.ok(result.includes('### Ours (main) commits:'))
      assert.ok(result.includes('- abc1234: Add numeric IDs'))
      assert.ok(result.includes('- def5678: Update schema'))
      assert.ok(result.includes('### Theirs (feature/uuids) commits:'))
      assert.ok(result.includes('- 111aaaa: Add UUID support'))
      // File content should still be present
      assert.ok(result.includes('## File: src/user.ts'))
    })

    it('includes PR context in output with body fenced', () => {
      const pr = makePullRequest(
        99,
        'Migrate to UUIDs',
        'This migrates all user IDs from integers to UUIDs.'
      )

      const result = formatConflictContextForPrompt(baseContext, null, pr)

      assert.ok(result.includes('## Pull Request Context'))
      assert.ok(result.includes('PR #99: Migrate to UUIDs'))
      assert.ok(result.includes('Description:'))
      assert.ok(
        result.includes('This migrates all user IDs from integers to UUIDs.')
      )
      // Should not include commit section
      assert.ok(!result.includes('## Recent Commits'))
      // File content should still be present
      assert.ok(result.includes('## File: src/user.ts'))

      // PR body with backticks should be wrapped in a fence
      const prBackticks = makePullRequest(
        42,
        'Docs update',
        '## Changes\n- Updated ```code``` examples'
      )
      const result2 = formatConflictContextForPrompt(
        baseContext,
        null,
        prBackticks
      )
      assert.ok(result2.includes('Description:'))
      // Body should be inside a fence longer than the triple backticks in content
      assert.ok(result2.includes('````'))
    })

    it('includes both commit and PR context in output', () => {
      const commitCtx: IConflictCommitContext = {
        ourCommits: [makeCommit('aaa1111', 'Fix type error')],
        theirCommits: [makeCommit('bbb2222', 'Add UUIDs')],
      }
      const pr = makePullRequest(50, 'UUID migration', 'Migrate IDs to UUIDs.')

      const result = formatConflictContextForPrompt(baseContext, commitCtx, pr)

      // PR section comes before commits
      const prIdx = result.indexOf('## Pull Request Context')
      const commitIdx = result.indexOf('## Recent Commits')
      const fileIdx = result.indexOf('## File: src/user.ts')

      assert.ok(prIdx !== -1, 'PR context should be present')
      assert.ok(commitIdx !== -1, 'Commit context should be present')
      assert.ok(fileIdx !== -1, 'File context should be present')
      assert.ok(
        prIdx < commitIdx,
        'PR context should come before commit context'
      )
      assert.ok(
        commitIdx < fileIdx,
        'Commit context should come before file context'
      )
    })

    it('is backward compatible when no enrichment is provided', () => {
      const withoutEnrichment = formatConflictContextForPrompt(baseContext)
      const withNulls = formatConflictContextForPrompt(baseContext, null, null)
      const withUndefined = formatConflictContextForPrompt(
        baseContext,
        undefined,
        undefined
      )

      // All three should produce the same output
      assert.equal(withoutEnrichment, withNulls)
      assert.equal(withoutEnrichment, withUndefined)

      // Should not include enrichment sections
      assert.ok(!withoutEnrichment.includes('## Pull Request Context'))
      assert.ok(!withoutEnrichment.includes('## Recent Commits'))

      // Should still include file context
      assert.ok(withoutEnrichment.includes('## File: src/user.ts'))
    })

    it('omits PR description section when body is empty', () => {
      const pr = makePullRequest(10, 'Quick fix', '')

      const result = formatConflictContextForPrompt(baseContext, null, pr)

      assert.ok(result.includes('PR #10: Quick fix'))
      assert.ok(!result.includes('Description:'))
    })

    it('omits commit sections when both sides have no commits', () => {
      const commitCtx: IConflictCommitContext = {
        ourCommits: [],
        theirCommits: [],
      }

      const result = formatConflictContextForPrompt(
        baseContext,
        commitCtx,
        null
      )

      assert.ok(!result.includes('## Recent Commits'))
      assert.ok(!result.includes('### Ours'))
      assert.ok(!result.includes('### Theirs'))
    })
    it('uses safe fences when content contains backticks', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'README.md',
            hunks: [
              {
                oursContent: 'Use ```ts\nconst x = 1\n``` for examples',
                theirsContent: 'Use ```js\nconst x = 2\n``` for examples',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      // The fence delimiter should be longer than the 3-backtick runs in content
      assert.ok(result.includes('````'))
    })

    it('sanitizes malicious file paths in markdown headings', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'src/evil\npath`inject.ts',
            hunks: [
              {
                oursContent: 'ours',
                theirsContent: 'theirs',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      // Newline and backtick should be stripped from the heading
      assert.ok(!result.includes('## File: src/evil\npath'))
      assert.ok(!result.includes('`inject'))
      assert.ok(result.includes('## File: src/evilpathinject.ts'))
    })

    it('falls back to empty language for non-alphanumeric extensions', () => {
      const context: ICopilotConflictContext = {
        ourLabel: 'main',
        theirLabel: 'feature',
        files: [
          {
            path: 'src/module.c++',
            hunks: [
              {
                oursContent: 'ours',
                theirsContent: 'theirs',
                baseContent: null,
                contextBefore: '',
                contextAfter: '',
              },
            ],
          },
        ],
      }

      const result = formatConflictContextForPrompt(context)

      // .c++ has non-alphanumeric '+' — should NOT appear as a language tag
      assert.ok(!result.includes('```c++'))
      // Should use a plain fence with no language
      assert.ok(result.includes('```\nours'))
    })

    it('handles one-sided commit context', () => {
      const commitCtx: IConflictCommitContext = {
        ourCommits: [makeCommit('aaa1111', 'Fix type error')],
        theirCommits: [],
      }

      const result = formatConflictContextForPrompt(
        baseContext,
        commitCtx,
        null
      )

      assert.ok(result.includes('## Recent Commits'))
      assert.ok(result.includes('aaa1111'))
      assert.ok(result.includes('Fix type error'))
      // Their side heading should still appear but with no commits listed
      assert.ok(result.includes('(theirs)'))
    })
  })
})
