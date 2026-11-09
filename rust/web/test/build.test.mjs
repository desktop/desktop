import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { win32 } from 'node:path'

const web = fileURLToPath(new URL('..', import.meta.url))

test('standalone frontend bundles without legacy backend, Node builtins, or Electron', async () => {
  const result = await build({
    absWorkingDir: web,
    entryPoints: ['src/panels.ts'],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const inputs = Object.keys(result.metafile.inputs)
  assert.ok(inputs.some(path => path.includes('src/upstream/row.tsx')))
  assert.ok(inputs.every(path => !path.startsWith('../../app/')))
  assert.ok(inputs.every(path => !path.includes('electron')))
  for (const output of Object.values(result.metafile.outputs))
    assert.deepEqual(output.imports, [])
})

test('legacy component entrypoints still bundle through the migrated implementations', async () => {
  const result = await build({
    absWorkingDir: web,
    stdin: {
      contents: ['row', 'form', 'horizontal-rule', 'highlight-text']
        .map(name => `export * from '../../app/src/ui/lib/${name}'`)
        .join('\n'),
      resolveDir: web,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
  })
  const inputs = Object.keys(result.metafile.inputs)
  for (const name of ['row', 'form', 'horizontal-rule', 'highlight-text']) {
    assert.ok(inputs.some(path => path.endsWith(`src/upstream/${name}.tsx`)))
  }
})

test('migrated diff models preserve legacy imports and compare complete hunk ranges', async () => {
  const built = await build({
    absWorkingDir: web,
    stdin: {
      contents:
        "export { DiffHunkHeader } from '../../app/src/models/diff/raw-diff'; export { DiffLine, DiffLineType } from '../../app/src/models/diff/diff-line'",
      resolveDir: web,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  })
  const models = await import(
    `data:text/javascript;base64,${Buffer.from(
      built.outputFiles[0].text
    ).toString('base64')}`
  )
  const one = new models.DiffHunkHeader(1, 2, 1, 2)
  assert.equal(one.equals(new models.DiffHunkHeader(1, 2, 1, 3)), false)
  assert.equal(one.equals(new models.DiffHunkHeader(1, 2, 1, 2)), true)
  const line = new models.DiffLine('+new', models.DiffLineType.Add, 1, null, 1)
  assert.equal(line.isIncludeableLine(), true)
  assert.equal(line.content, 'new')
  assert.equal(line.withNoTrailingNewLine(true).noTrailingNewLine, true)
})

test('shared commit, branch, remote, workflow, and trailer models remain independent of the legacy backend', async () => {
  const compiled = await build({
    absWorkingDir: web,
    stdin: {
      contents:
        "export * from '../../app/src/models/commit'; export * from '../../app/src/models/commit-identity'; export * from '../../app/src/models/git-author'; export * from '../../app/src/models/branch'; export * from '../../app/src/models/remote'; export * from '../../app/src/models/workflow-preferences'; export * from './src/upstream/trailers'",
      resolveDir: web,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
  })
  const source = Object.keys(compiled.metafile.inputs)
  assert.ok(source.every(path => !path.includes('lib/git/core')))
  assert.ok(
    source.some(path =>
      path.endsWith('src/upstream/models/workflow-preferences.ts')
    )
  )
  const models = await import(
    `data:text/javascript;base64,${Buffer.from(
      compiled.outputFiles[0].text
    ).toString('base64')}`
  )
  const trailers = models.parseRawUnfoldedTrailers(
    'Co-authored-by: Helper <h@example.invalid>\n',
    ':'
  )
  const who = models.CommitIdentity.parseIdentity(
    'Author <a@example.invalid> 1 +0200'
  )
  const commit = new models.Commit(
    'sha',
    'sha',
    'Summary',
    'Body',
    who,
    who,
    ['parent'],
    trailers,
    []
  )
  assert.equal(commit.coAuthors[0].toString(), 'Helper <h@example.invalid>')
  assert.equal(who.tzOffset, 120)
  const branch = new models.Branch(
    'main',
    'origin/main',
    { sha: 'sha' },
    models.BranchType.Local,
    'refs/heads/main'
  )
  assert.equal(branch.upstreamWithoutRemote, 'main')
  assert.deepEqual(models.ForkContributionTarget, {
    Parent: 'parent',
    Self: 'self',
  })
})

test('shared worktree display helpers handle native separators without Node imports', async () => {
  const built = await build({
    absWorkingDir: web,
    stdin: {
      contents: "export * from './src/upstream/models/worktree'",
      resolveDir: web,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  })
  const models = await import(
    `data:text/javascript;base64,${Buffer.from(
      built.outputFiles[0].text
    ).toString('base64')}`
  )
  const entry = {
    path: '/repo/path\\literal/',
    head: 'abcdef123',
    branch: 'refs/heads/topic',
    isPrunable: false,
  }
  assert.equal(models.getWorktreeDisplayName(entry), 'path\\literal')
  assert.equal(
    models.getWorktreeDisplayName({ ...entry, path: 'C:\\repo\\project\\' }),
    'project'
  )
  assert.equal(
    models.getWorktreeDisplayName(
      { ...entry, path: 'relative\\project' },
      '\\'
    ),
    'project'
  )
  assert.equal(models.getWorktreeDescription(entry), 'topic')
  assert.equal(
    models.getWorktreeDisplayName(
      { ...entry, path: win32.join('relative', 'project') },
      win32.sep
    ),
    'project'
  )
})

// The checked-in artifact is what Rust embeds, including when Node is absent.
test('embedded frontend preserves the shared-source and bundled runtime license notices', async () => {
  const artifact = await readFile(
    new URL('../panels.js', import.meta.url),
    'utf8'
  )
  assert(artifact.includes('Copyright (c) 2015 Jam3'))
  assert(artifact.includes('Copyright (c) Facebook, Inc. and its affiliates.'))
  assert(artifact.includes('Permission is hereby granted, free of charge'))
  assert(artifact.includes('GitHub Desktop shared browser code'))
})
