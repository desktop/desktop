import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  parseCopilotConflictResolution,
  reassembleResolvedFile,
  extractSymbols,
  createDependencyAwareChunks,
  selectReferencedContext,
  fallbackReferencedContext,
} from '../../src/lib/copilot-conflict-resolution'
import {
  IFileConflictContext,
  IConflictResolutionContext,
  IConflictContextCommit,
  IConflictContextPullRequest,
} from '../../src/lib/copilot-conflict-context'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a resolution entry in the per-hunk format the parser expects. */
function makeResolution(
  path: string,
  resolvedContent: string | ReadonlyArray<string>,
  reasoning: string
) {
  const hunks = Array.isArray(resolvedContent)
    ? resolvedContent.map(rc => ({ resolvedContent: rc }))
    : [{ resolvedContent }]
  return { path, hunks, reasoning }
}

function makeFile(
  path: string,
  oursContent: string,
  theirsContent: string,
  opts?: { baseContent?: string; contextBefore?: string; contextAfter?: string }
): IFileConflictContext {
  return {
    path,
    hunks: [
      {
        oursContent,
        theirsContent,
        baseContent: opts?.baseContent ?? null,
        contextBefore: opts?.contextBefore ?? '',
        contextAfter: opts?.contextAfter ?? '',
      },
    ],
  }
}

function paths(
  chunks: ReadonlyArray<ReadonlyArray<IFileConflictContext>>
): ReadonlyArray<ReadonlyArray<string>> {
  return chunks.map(c => c.map(f => f.path))
}

// ---------------------------------------------------------------------------
// parseCopilotConflictResolution
// ---------------------------------------------------------------------------

describe('parseCopilotConflictResolution', () => {
  it('parses a valid JSON response', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('src/index.ts', 'content', 'combined both')],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions.length, 1)
    assert.equal(result.resolutions[0].path, 'src/index.ts')
    assert.equal(result.resolutions[0].hunks[0].resolvedContent, 'content')
    assert.equal(result.resolutions[0].reasoning, 'combined both')
  })

  it('unwraps ```json code blocks', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'x', 'r')],
    })
    const wrapped = '```json\n' + json + '\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('unwraps ``` code blocks without json tag', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'x', 'r')],
    })
    const wrapped = '```\n' + json + '\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('handles multiple resolutions', () => {
    const json = JSON.stringify({
      resolutions: [
        makeResolution('a.ts', 'a', 'ra'),
        makeResolution('b.ts', 'b', 'rb'),
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions.length, 2)
  })

  it('throws on invalid JSON', () => {
    assert.throws(
      () => parseCopilotConflictResolution('not json'),
      /invalid JSON/
    )
  })

  it('throws on non-object payload', () => {
    assert.throws(
      () => parseCopilotConflictResolution('"string"'),
      /expected an object/
    )
  })

  it('throws on missing resolutions array', () => {
    assert.throws(
      () => parseCopilotConflictResolution('{"foo":"bar"}'),
      /"resolutions" must be an array/
    )
  })

  it('throws on empty resolutions array', () => {
    assert.throws(
      () => parseCopilotConflictResolution('{"resolutions":[]}'),
      /"resolutions" must not be empty/
    )
  })

  it('throws on missing path', () => {
    const json = JSON.stringify({
      resolutions: [{ hunks: [{ resolvedContent: 'c' }], reasoning: 'r' }],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /"path" at index 0/
    )
  })

  it('throws on empty path', () => {
    const json = JSON.stringify({
      resolutions: [
        { path: '  ', hunks: [{ resolvedContent: 'c' }], reasoning: 'r' },
      ],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /"path" at index 0/
    )
  })

  it('throws on missing hunks', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"path":"a.ts","reasoning":"r"}]}'
        ),
      /"hunks" at index 0 must be an array/
    )
  })

  it('throws on empty hunks array', () => {
    const json = JSON.stringify({
      resolutions: [{ path: 'a.ts', hunks: [], reasoning: 'r' }],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /"hunks" at index 0 must not be empty/
    )
  })

  it('throws on missing reasoning', () => {
    const json = JSON.stringify({
      resolutions: [{ path: 'a.ts', hunks: [{ resolvedContent: 'c' }] }],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /"reasoning" at index 0/
    )
  })

  it('allows empty resolvedContent in a hunk (intentional deletion)', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', '', 'emptied')],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].hunks[0].resolvedContent, '')
  })

  it('handles resolvedContent containing triple backticks', () => {
    const json = JSON.stringify({
      resolutions: [
        makeResolution(
          'README.md',
          '# Hello\n```js\nconsole.log()\n```\n',
          'kept code block'
        ),
      ],
    })
    const wrapped = '```json\n' + json + '\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'README.md')
    assert.ok(result.resolutions[0].hunks[0].resolvedContent.includes('```js'))
  })

  it('parses when LLM adds preamble/postamble around code block', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'fixed', 'merged')],
    })
    const content =
      'Here is my answer:\n```json\n' + json + '\n```\nHope this helps!'
    const result = parseCopilotConflictResolution(content)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('throws when resolvedContent still contains conflict markers', () => {
    const json = JSON.stringify({
      resolutions: [
        makeResolution(
          'a.ts',
          '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature',
          'oops'
        ),
      ],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /still contains conflict markers/
    )
  })

  it('does not reject resolvedContent with only opening marker in a comment', () => {
    const json = JSON.stringify({
      resolutions: [
        makeResolution(
          'a.ts',
          '// <<<<<<< this is just a comment\nreal code',
          'fine'
        ),
      ],
    })
    // Should NOT throw — only reject when both opening and separator markers present
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('throws on truncated conflict markers (opening + separator without closing)', () => {
    const json = JSON.stringify({
      resolutions: [
        makeResolution(
          'a.ts',
          '<<<<<<< HEAD\nours\n=======\ntheirs but truncated',
          'truncated'
        ),
      ],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /still contains conflict markers/
    )
  })

  it('parses JSON block followed by another code block', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'fixed', 'merged')],
    })
    const content =
      '```json\n' +
      json +
      '\n```\n\nYou can verify with:\n```bash\nnpm test\n```'
    const result = parseCopilotConflictResolution(content)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('trims whitespace from path values', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('  src/file.ts  ', 'content', 'reason')],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/file.ts')
  })

  it('normalizes Windows-style backslash separators', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('src\\lib\\file.ts', 'content', 'reason')],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/lib/file.ts')
  })

  it('strips leading ./ from paths', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('./src/file.ts', 'content', 'reason')],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/file.ts')
  })

  it('collapses redundant path separators', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('src//lib///file.ts', 'content', 'reason')],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/lib/file.ts')
  })

  it('returns null summary when missing, mistyped, or blank', () => {
    const base = [makeResolution('a.ts', 'c', 'r')]
    for (const summary of [undefined, 42, '   ']) {
      const json = JSON.stringify({ resolutions: base, summary })
      assert.equal(parseCopilotConflictResolution(json).summary, null)
    }
  })

  it('preserves a non-empty summary string', () => {
    const summary = '## What changed\nA.\n\n## Resolution decision\nB.'
    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'c', 'r')],
      summary,
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.summary, summary)
  })

  it('parses valid references and strips a leading # from PR ids', () => {
    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'c', 'r')],
      references: [
        { type: 'pullRequest', id: '#42' },
        { type: 'commit', id: 'abc1234' },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.deepEqual(result.references, [
      { type: 'pullRequest', id: '42' },
      { type: 'commit', id: 'abc1234' },
    ])
  })

  it('returns empty references when missing and drops invalid entries', () => {
    const missing = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'c', 'r')],
    })
    assert.deepEqual(parseCopilotConflictResolution(missing).references, [])

    const json = JSON.stringify({
      resolutions: [makeResolution('a.ts', 'c', 'r')],
      references: [
        { type: 'wrong', id: '1' },
        { type: 'pullRequest', id: 'abc' },
        { type: 'commit', id: 'xyz' },
        { type: 'commit', id: 'cafe1234' },
        'string',
        null,
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.deepEqual(result.references, [{ type: 'commit', id: 'cafe1234' }])
  })
})

// ---------------------------------------------------------------------------
// reassembleResolvedFile
// ---------------------------------------------------------------------------

describe('reassembleResolvedFile', () => {
  it('replaces a single conflict in the middle of a file', () => {
    const raw = [
      'line 1',
      'line 2',
      '<<<<<<< HEAD',
      'our change',
      '=======',
      'their change',
      '>>>>>>> feature',
      'line 3',
      'line 4',
    ].join('\n')

    const result = reassembleResolvedFile(raw, [
      { resolvedContent: 'merged change' },
    ])

    assert.equal(
      result,
      ['line 1', 'line 2', 'merged change', 'line 3', 'line 4'].join('\n')
    )
  })

  it('replaces multiple conflicts in order', () => {
    const raw = [
      'header',
      '<<<<<<< HEAD',
      'our-1',
      '=======',
      'their-1',
      '>>>>>>> feature',
      'middle',
      '<<<<<<< HEAD',
      'our-2',
      '=======',
      'their-2',
      '>>>>>>> feature',
      'footer',
    ].join('\n')

    const result = reassembleResolvedFile(raw, [
      { resolvedContent: 'resolved-1' },
      { resolvedContent: 'resolved-2' },
    ])

    assert.equal(
      result,
      ['header', 'resolved-1', 'middle', 'resolved-2', 'footer'].join('\n')
    )
  })

  it('handles diff3 (three-way) markers', () => {
    const raw = [
      'before',
      '<<<<<<< HEAD',
      'ours',
      '||||||| base',
      'original',
      '=======',
      'theirs',
      '>>>>>>> feature',
      'after',
    ].join('\n')

    const result = reassembleResolvedFile(raw, [{ resolvedContent: 'merged' }])

    assert.equal(result, ['before', 'merged', 'after'].join('\n'))
  })

  it('handles empty resolved content (intentional deletion)', () => {
    const raw = [
      'keep this',
      '<<<<<<< HEAD',
      'delete me',
      '=======',
      'also delete',
      '>>>>>>> feature',
      'keep this too',
    ].join('\n')

    const result = reassembleResolvedFile(raw, [{ resolvedContent: '' }])

    assert.equal(result, ['keep this', 'keep this too'].join('\n'))
  })

  it('handles multi-line resolved content', () => {
    const raw = [
      'start',
      '<<<<<<< HEAD',
      'a',
      '=======',
      'b',
      '>>>>>>> feature',
      'end',
    ].join('\n')

    const result = reassembleResolvedFile(raw, [
      { resolvedContent: 'line1\nline2\nline3' },
    ])

    assert.equal(result, ['start', 'line1', 'line2', 'line3', 'end'].join('\n'))
  })

  it('preserves CRLF line endings', () => {
    const raw = [
      'line 1',
      '<<<<<<< HEAD',
      'ours',
      '=======',
      'theirs',
      '>>>>>>> feature',
      'line 2',
    ].join('\r\n')

    const result = reassembleResolvedFile(raw, [{ resolvedContent: 'merged' }])

    assert.equal(result, ['line 1', 'merged', 'line 2'].join('\r\n'))
  })

  it('preserves file with no conflicts unchanged', () => {
    const raw = 'line 1\nline 2\nline 3'
    const result = reassembleResolvedFile(raw, [])
    assert.equal(result, raw)
  })

  it('treats malformed markers (missing separator) as regular content', () => {
    const raw = [
      'line 1',
      '<<<<<<< HEAD',
      'some content',
      '>>>>>>> feature',
      'line 2',
    ].join('\n')

    // No ======= separator → not a valid conflict block, copy through
    const result = reassembleResolvedFile(raw, [])

    assert.equal(result, raw)
  })

  it('treats unclosed markers (missing >>>>>>>) as regular content', () => {
    const raw = [
      'line 1',
      '<<<<<<< HEAD',
      'some content',
      '=======',
      'other content',
      'line 2',
    ].join('\n')

    // No >>>>>>> closing → not a valid conflict block, copy through
    const result = reassembleResolvedFile(raw, [])

    assert.equal(result, raw)
  })
})

// ---------------------------------------------------------------------------
// extractSymbols
// ---------------------------------------------------------------------------

describe('extractSymbols', () => {
  it('extracts exports from hunk content', () => {
    const file = makeFile(
      'utils.ts',
      'export function foo() {}',
      'export const bar = 1'
    )
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('foo'))
    assert.ok(exports.has('bar'))
  })

  it('extracts all export kinds', () => {
    const file = makeFile(
      'types.ts',
      [
        'export class MyClass {}',
        'export interface IMyInterface {}',
        'export type MyType = string',
        'export enum MyEnum {}',
        'export let myLet = 1',
      ].join('\n'),
      ''
    )
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('MyClass'))
    assert.ok(exports.has('IMyInterface'))
    assert.ok(exports.has('MyType'))
    assert.ok(exports.has('MyEnum'))
    assert.ok(exports.has('myLet'))
  })

  it('extracts import paths and named references', () => {
    const file = makeFile(
      'app.ts',
      "import { foo, bar as baz } from '../utils'",
      ''
    )
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('../utils'))
    assert.ok(references.has('foo'))
    assert.ok(references.has('bar'))
    assert.ok(
      !references.has('baz'),
      'alias should not be treated as a reference'
    )
  })

  it('extracts default import references', () => {
    const file = makeFile('consumer.ts', "import React from 'react'", '')
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('react'))
    assert.ok(references.has('React'))
  })

  it('extracts extends/implements/instanceof/new/typeof references', () => {
    const file = makeFile(
      'child.ts',
      'class Child extends BaseClass implements IFoo {}',
      'const x = new Widget()\nif (a instanceof Handler) {}\ntype T = typeof Config'
    )
    const { references } = extractSymbols(file)
    assert.ok(references.has('BaseClass'))
    assert.ok(references.has('IFoo'))
    assert.ok(references.has('Widget'))
    assert.ok(references.has('Handler'))
    assert.ok(references.has('Config'))
  })

  it('scans base content when present', () => {
    const file = makeFile('a.ts', '', '', {
      baseContent: 'export function fromBase() {}',
    })
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('fromBase'))
  })

  it('scans context lines', () => {
    const file = makeFile('b.ts', '', '', {
      contextBefore: "import { ctxBefore } from './dep'",
      contextAfter: 'export const ctxAfter = 1',
    })
    const { references, exports } = extractSymbols(file)
    assert.ok(references.has('ctxBefore'))
    assert.ok(exports.has('ctxAfter'))
  })

  it('returns empty sets for a file with no symbols', () => {
    const file = makeFile('readme.md', 'plain text', 'other text')
    const { exports, importPaths, references } = extractSymbols(file)
    assert.equal(exports.size, 0)
    assert.equal(importPaths.size, 0)
    assert.equal(references.size, 0)
  })

  it('extracts namespace imports (import * as X)', () => {
    const file = makeFile('app.ts', "import * as React from 'react'", '')
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('react'))
    assert.ok(references.has('React'))
  })

  it('extracts combined default + named imports', () => {
    const file = makeFile(
      'app.ts',
      "import React, { useState, useEffect } from 'react'",
      ''
    )
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('react'))
    assert.ok(references.has('React'))
    assert.ok(references.has('useState'))
    assert.ok(references.has('useEffect'))
  })

  it('extracts type-only imports', () => {
    const file = makeFile(
      'types.ts',
      "import type { Foo, Bar } from './models'",
      ''
    )
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('./models'))
    assert.ok(references.has('Foo'))
    assert.ok(references.has('Bar'))
  })

  it('strips inline type keyword from named imports', () => {
    const file = makeFile(
      'consumer.ts',
      "import { type Foo, bar } from './lib'",
      ''
    )
    const { references } = extractSymbols(file)
    assert.ok(references.has('Foo'), 'should extract Foo without "type" prefix')
    assert.ok(references.has('bar'))
  })
})

// ---------------------------------------------------------------------------
// createDependencyAwareChunks
// ---------------------------------------------------------------------------

describe('createDependencyAwareChunks', () => {
  it('returns all files in a single chunk when count <= targetSize', () => {
    const files = [makeFile('a.ts', '', ''), makeFile('b.ts', '', '')]
    const chunks = createDependencyAwareChunks(files, 5)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].length, 2)
  })

  it('groups files that import from each other', () => {
    const fileA = makeFile('src/utils.ts', 'export function helper() {}', '')
    const fileB = makeFile('src/app.ts', "import { helper } from './utils'", '')
    const fileC = makeFile('src/unrelated.ts', 'const x = 1', '')

    const chunks = createDependencyAwareChunks([fileA, fileB, fileC], 2)
    const chunkPaths = paths(chunks)

    // A and B should be in the same chunk
    const chunkWithA = chunkPaths.find(c => c.includes('src/utils.ts'))!
    assert.ok(
      chunkWithA.includes('src/app.ts'),
      'utils and app should be grouped'
    )

    // C should be separate (or in a different chunk)
    const chunkWithC = chunkPaths.find(c => c.includes('src/unrelated.ts'))!
    assert.ok(
      !chunkWithC.includes('src/utils.ts'),
      'unrelated should not be with utils'
    )
  })

  it('groups files that share exported/referenced symbols', () => {
    const fileA = makeFile('a.ts', 'export class MyService {}', '')
    const fileB = makeFile('b.ts', '', 'const s = new MyService()')
    const fileC = makeFile('c.ts', 'const y = 2', '')

    const chunks = createDependencyAwareChunks([fileA, fileB, fileC], 2)
    const chunkPaths = paths(chunks)

    const chunkWithA = chunkPaths.find(c => c.includes('a.ts'))!
    assert.ok(chunkWithA.includes('b.ts'), 'a and b share MyService reference')
  })

  it('splits large dependency groups beyond target size', () => {
    // Create a group of 6 files all exporting/referencing the same symbol
    const files: Array<IFileConflictContext> = []
    for (let i = 0; i < 6; i++) {
      files.push(
        makeFile(
          `file${i}.ts`,
          'export function sharedFn() {}',
          'const x = new sharedFn()'
        )
      )
    }

    const chunks = createDependencyAwareChunks(files, 3)

    // Should produce at least 2 chunks since group of 6 exceeds target of 3
    assert.ok(chunks.length >= 2)
    // No chunk should exceed target size
    for (const chunk of chunks) {
      assert.ok(
        chunk.length <= 3,
        `chunk has ${chunk.length} files, expected <= 3`
      )
    }
  })

  it('bin-packs small independent groups', () => {
    // 4 independent files, target size 2
    const files = [
      makeFile('a.ts', 'const a = 1', ''),
      makeFile('b.ts', 'const b = 2', ''),
      makeFile('c.ts', 'const c = 3', ''),
      makeFile('d.ts', 'const d = 4', ''),
    ]

    const chunks = createDependencyAwareChunks(files, 2)
    // Should produce 2 chunks of 2
    assert.equal(chunks.length, 2)
    assert.equal(chunks[0].length, 2)
    assert.equal(chunks[1].length, 2)
  })

  it('every input file appears in exactly one chunk', () => {
    const files: Array<IFileConflictContext> = []
    for (let i = 0; i < 25; i++) {
      files.push(makeFile(`file${i}.ts`, `const x${i} = ${i}`, ''))
    }

    const chunks = createDependencyAwareChunks(files, 5)
    const allPaths = chunks.flatMap(c => c.map(f => f.path))

    // Every file accounted for
    assert.equal(allPaths.length, 25)
    assert.equal(new Set(allPaths).size, 25, 'no duplicates')
  })

  it('does not false-positive group files with short basenames', () => {
    // "e.ts" basename "e" should NOT match import path "../database"
    // via the old .includes() logic — the new matchesBaseName requires
    // a full segment match. We verify by checking that "e.ts" and
    // "database.ts" are NOT forced into the same dependency group.
    // With 4 files and targetSize 2, if e and database were incorrectly
    // grouped they'd form a group of 2 that stays together.
    const fileE = makeFile('src/e.ts', 'export const val = 1', '')
    const fileDb = makeFile(
      'src/database.ts',
      "import { something } from '../e'",
      ''
    )
    const fileOther = makeFile('src/other.ts', 'const x = 1', '')
    const fileThird = makeFile('src/third.ts', 'const y = 2', '')

    // e.ts and database.ts SHOULD be grouped because database imports from '../e'
    const chunks = createDependencyAwareChunks(
      [fileE, fileDb, fileOther, fileThird],
      2
    )
    const chunkPaths = paths(chunks)
    const chunkWithE = chunkPaths.find(c => c.includes('src/e.ts'))!
    assert.ok(
      chunkWithE.includes('src/database.ts'),
      'e.ts and database.ts should be grouped (database imports from e)'
    )

    // Now verify that a different import path does NOT match
    const fileE2 = makeFile('src/e.ts', 'export const val = 1', '')
    const fileDb2 = makeFile(
      'src/database.ts',
      "import { something } from '../components'",
      ''
    )
    const fileApi = makeFile(
      'src/api.ts',
      "import { thing } from '@sentry/error-reporting'",
      ''
    )
    const fileMisc = makeFile('src/misc.ts', 'const z = 3', '')

    // None of these files actually import from each other
    const chunks2 = createDependencyAwareChunks(
      [fileE2, fileDb2, fileApi, fileMisc],
      2
    )
    // Should split into 2 chunks of 2, not collapse into fewer
    assert.equal(chunks2.length, 2, 'unrelated files should not be grouped')
  })

  it('does not group unrelated index.ts files together', () => {
    const file1 = makeFile(
      'src/auth/index.ts',
      "import { User } from '../models/user'",
      ''
    )
    const file2 = makeFile(
      'src/ui/index.ts',
      "import { Button } from './button'",
      ''
    )
    const file3 = makeFile('src/api/index.ts', 'export const api = {}', '')

    const chunks = createDependencyAwareChunks([file1, file2, file3], 2)
    // They should NOT all be in one chunk — they're unrelated despite
    // sharing basename "index"
    assert.ok(
      chunks.length >= 2,
      'unrelated index.ts files should not all be grouped together'
    )
  })

  it('handles group.length exactly equal to targetSize', () => {
    // 3 files all referencing the same symbol, targetSize = 3
    const files = [
      makeFile('a.ts', 'export class Shared {}', ''),
      makeFile('b.ts', '', 'const x = new Shared()'),
      makeFile('c.ts', '', 'const y = new Shared()'),
      makeFile('d.ts', 'const standalone = 1', ''),
    ]

    const chunks = createDependencyAwareChunks(files, 3)
    const allPaths = chunks.flatMap(c => c.map(f => f.path))
    assert.equal(new Set(allPaths).size, 4, 'all files present')
    // The group of 3 should be split (>= targetSize takes split path)
    // and d.ts should be separate
    for (const chunk of chunks) {
      assert.ok(
        chunk.length <= 3,
        `chunk has ${chunk.length} files, expected <= 3`
      )
    }
  })
})

// ---------------------------------------------------------------------------
// selectReferencedContext
// ---------------------------------------------------------------------------

function makeResolutionContext(
  overrides: Partial<IConflictResolutionContext> = {}
): IConflictResolutionContext {
  return {
    ourLabel: 'main',
    theirLabel: 'feature',
    files: [],
    pullRequests: [],
    ourCommits: [],
    theirCommits: [],
    ...overrides,
  }
}

function ctxCommit(
  sha: string,
  summary: string,
  isOnRemote: boolean = true
): IConflictContextCommit {
  return {
    sha: sha.toLowerCase().padEnd(40, '0'),
    shortSha: sha.slice(0, 7),
    summary,
    isOnRemote,
  }
}

function ctxPr(prNumber: number, title: string): IConflictContextPullRequest {
  return {
    number: prNumber,
    title,
    body: '',
  }
}

describe('selectReferencedContext', () => {
  it('resolves pull request references against the gathered context', () => {
    const context = makeResolutionContext({
      pullRequests: [ctxPr(20, 'Add greetings')],
    })

    const selected = selectReferencedContext(
      [{ type: 'pullRequest', id: '20' }],
      context
    )

    assert.equal(selected.length, 1)
    assert.equal(selected[0].kind, 'pullRequest')
    if (selected[0].kind === 'pullRequest') {
      assert.equal(selected[0].pullRequest.number, 20)
    }
  })

  it('resolves commit references by full and abbreviated SHA', () => {
    const commit = ctxCommit('abc1234def', 'Fix bug')
    const context = makeResolutionContext({ theirCommits: [commit] })

    const byShort = selectReferencedContext(
      [{ type: 'commit', id: 'abc1234' }],
      context
    )
    assert.equal(byShort.length, 1)
    assert.equal(byShort[0].kind, 'commit')

    const byFull = selectReferencedContext(
      [{ type: 'commit', id: commit.sha }],
      context
    )
    assert.equal(byFull.length, 1)
  })

  it('refuses to resolve short or ambiguous commit prefixes', () => {
    const context = makeResolutionContext({
      theirCommits: [
        ctxCommit('abc1234aaa', 'First'),
        ctxCommit('abc1234bbb', 'Second'),
      ],
    })

    // Too short to prefix-match
    assert.equal(
      selectReferencedContext([{ type: 'commit', id: 'abc' }], context).length,
      0
    )
    // 7-char prefix shared by two commits is ambiguous -> dropped
    assert.equal(
      selectReferencedContext([{ type: 'commit', id: 'abc1234' }], context)
        .length,
      0
    )
  })

  it('promotes a merge commit to its pull request, de-duplicating direct citations', () => {
    const context = makeResolutionContext({
      pullRequests: [ctxPr(20, 'Add greetings')],
      theirCommits: [ctxCommit('mergesha123', 'Add greetings (#20)')],
    })

    // Citing the merge commit alone resolves to the promoted PR...
    const promoted = selectReferencedContext(
      [{ type: 'commit', id: 'mergesha123' }],
      context
    )
    assert.equal(promoted.length, 1)
    assert.equal(promoted[0].kind, 'pullRequest')
    if (promoted[0].kind === 'pullRequest') {
      assert.equal(promoted[0].pullRequest.number, 20)
    }

    // ...and citing both the PR and its merge commit yields a single entry.
    const deduped = selectReferencedContext(
      [
        { type: 'pullRequest', id: '20' },
        { type: 'commit', id: 'mergesha123' },
      ],
      context
    )
    assert.equal(deduped.length, 1)
    assert.equal(deduped[0].kind, 'pullRequest')
  })

  it('keeps a merge commit as a commit when its PR was not gathered', () => {
    const context = makeResolutionContext({
      theirCommits: [ctxCommit('mergesha123', 'Add greetings (#20)')],
    })

    const selected = selectReferencedContext(
      [{ type: 'commit', id: 'mergesha123' }],
      context
    )

    assert.equal(selected.length, 1)
    assert.equal(selected[0].kind, 'commit')
  })
})

describe('fallbackReferencedContext', () => {
  it('prefers the incoming pull request over commits', () => {
    const context = makeResolutionContext({
      pullRequests: [ctxPr(20, 'Add greetings')],
      theirCommits: [ctxCommit('abc1234', 'Add greetings')],
    })

    const fallback = fallbackReferencedContext(context)

    assert.equal(fallback.length, 1)
    assert.equal(fallback[0].kind, 'pullRequest')
  })

  it('falls back to a meaningful commit, skipping noise', () => {
    const context = makeResolutionContext({
      theirCommits: [
        ctxCommit('mergesha', 'Merge branch main'),
        ctxCommit('abc1234', 'Add time-of-day greetings'),
      ],
    })

    const fallback = fallbackReferencedContext(context)

    assert.equal(fallback.length, 1)
    assert.equal(fallback[0].kind, 'commit')
    assert.equal(
      fallback[0].kind === 'commit' && fallback[0].commit.summary,
      'Add time-of-day greetings'
    )
  })

  it('returns empty when there are no commits or pull requests', () => {
    assert.equal(fallbackReferencedContext(makeResolutionContext()).length, 0)
  })
})
