import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  createCopilotInMemorySessionFsProvider,
  getCopilotInMemorySessionFsConfig,
} from '../../src/lib/copilot-in-memory-session-fs-provider'

describe('getCopilotInMemorySessionFsConfig', () => {
  it('uses a POSIX session filesystem rooted in the in-memory state directory', () => {
    assert.deepStrictEqual(
      getCopilotInMemorySessionFsConfig('/repo', 'posix'),
      {
        initialCwd: '/repo',
        sessionStatePath: 'state',
        conventions: 'posix',
      }
    )
  })

  it('normalizes Windows repository paths for POSIX session filesystem conventions on non-Windows platforms', () => {
    assert.deepStrictEqual(
      getCopilotInMemorySessionFsConfig('C:\\repo\\project', 'posix'),
      {
        initialCwd: '/c/repo/project',
        sessionStatePath: 'state',
        conventions: 'posix',
      }
    )
  })

  it('uses Windows session filesystem conventions', () => {
    assert.deepStrictEqual(
      getCopilotInMemorySessionFsConfig('C:\\repo\\project', 'windows'),
      {
        initialCwd: 'C:\\repo\\project',
        sessionStatePath: 'state',
        conventions: 'windows',
      }
    )
  })

  it('falls back to a normalized process cwd when no repository path is provided', () => {
    const originalCwd = process.cwd

    process.cwd = () => 'D:\\a\\desktop\\desktop'
    try {
      assert.deepStrictEqual(
        getCopilotInMemorySessionFsConfig(undefined, 'posix'),
        {
          initialCwd: '/d/a/desktop/desktop',
          sessionStatePath: 'state',
          conventions: 'posix',
        }
      )
    } finally {
      process.cwd = originalCwd
    }
  })

  it('falls back to a Windows process cwd on Windows', () => {
    const originalCwd = process.cwd

    process.cwd = () => 'D:\\a\\desktop\\desktop'
    try {
      assert.deepStrictEqual(
        getCopilotInMemorySessionFsConfig(undefined, 'windows'),
        {
          initialCwd: 'D:\\a\\desktop\\desktop',
          sessionStatePath: 'state',
          conventions: 'windows',
        }
      )
    } finally {
      process.cwd = originalCwd
    }
  })
})

describe('createCopilotInMemorySessionFsProvider', () => {
  it('creates isolated providers with the default state directory', async () => {
    const provider = createCopilotInMemorySessionFsProvider()
    const otherProvider = createCopilotInMemorySessionFsProvider()

    assert.deepStrictEqual(await provider.readdir('.'), ['state'])

    await provider.writeFile('state/events.jsonl', 'event')

    assert.strictEqual(await provider.exists('state/events.jsonl'), true)
    assert.strictEqual(await otherProvider.exists('state/events.jsonl'), false)
  })

  it('writes, reads, and appends files while creating parent directories', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/events/one.jsonl', 'first')
    await provider.appendFile('state/events/one.jsonl', '\nsecond')

    assert.strictEqual(
      await provider.readFile('state/events/one.jsonl'),
      'first\nsecond'
    )
    assert.strictEqual(await provider.exists('state/events'), true)
    assert.deepStrictEqual(await provider.readdir('state'), ['events'])
  })

  it('normalizes POSIX paths consistently', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state//events/../events/one.jsonl', 'event')

    assert.strictEqual(
      await provider.readFile('state/events/one.jsonl'),
      'event'
    )
    assert.deepStrictEqual(await provider.readdir('state/'), ['events'])
  })

  it('handles absolute POSIX paths without recursing indefinitely', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('/state/events.jsonl', 'event')

    assert.strictEqual(await provider.readFile('/state/events.jsonl'), 'event')
    assert.deepStrictEqual(await provider.readdir('/'), ['state'])
    assert.deepStrictEqual(await provider.readdir('/state'), ['events.jsonl'])
  })

  it('normalizes Windows paths consistently', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state\\events\\one.jsonl', 'event')

    assert.strictEqual(
      await provider.readFile('state/events/one.jsonl'),
      'event'
    )
    assert.deepStrictEqual(await provider.readdir('state\\'), ['events'])
    assert.deepStrictEqual(await provider.readdir('state\\events'), [
      'one.jsonl',
    ])
  })

  it('lists root-level files with the correct type', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('/events.jsonl', 'event')

    assert.deepStrictEqual(await provider.readdirWithTypes('/'), [
      { name: 'events.jsonl', type: 'file' },
    ])
  })

  it('reports file and directory metadata', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/events.jsonl', 'event')

    const fileInfo = await provider.stat('state/events.jsonl')
    const directoryInfo = await provider.stat('state')

    assert.strictEqual(fileInfo.isFile, true)
    assert.strictEqual(fileInfo.isDirectory, false)
    assert.strictEqual(fileInfo.size, Buffer.byteLength('event'))
    assert.strictEqual(Number.isNaN(Date.parse(fileInfo.mtime)), false)
    assert.strictEqual(Number.isNaN(Date.parse(fileInfo.birthtime)), false)

    assert.strictEqual(directoryInfo.isFile, false)
    assert.strictEqual(directoryInfo.isDirectory, true)
    assert.strictEqual(directoryInfo.size, 0)
    assert.strictEqual(Number.isNaN(Date.parse(directoryInfo.mtime)), false)
    assert.strictEqual(Number.isNaN(Date.parse(directoryInfo.birthtime)), false)
  })

  it('keeps directory metadata stable between stat calls', async () => {
    const provider = createCopilotInMemorySessionFsProvider()
    const firstInfo = await provider.stat('state')

    await new Promise(resolve => setTimeout(resolve, 10))

    const secondInfo = await provider.stat('state')

    assert.strictEqual(secondInfo.mtime, firstInfo.mtime)
    assert.strictEqual(secondInfo.birthtime, firstInfo.birthtime)
  })

  it('lists direct children with type information', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/events.jsonl', 'event')
    await provider.mkdir('state/workspace', false)
    await provider.writeFile('state/workspace/context.json', '{}')

    const entries = await provider.readdirWithTypes('state')

    assert.deepStrictEqual(
      entries.sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: 'events.jsonl', type: 'file' },
        { name: 'workspace', type: 'directory' },
      ]
    )
  })

  it('requires existing parent directories for non-recursive mkdir', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await assert.rejects(
      () => provider.mkdir('state/workspace/nested', false),
      /ENOENT/
    )

    await provider.mkdir('state/workspace', false)
    await provider.mkdir('state/workspace/nested', false)

    assert.deepStrictEqual(await provider.readdir('state/workspace'), [
      'nested',
    ])
  })

  it('does not allow files and directories to share a path', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await assert.rejects(() => provider.writeFile('state', 'event'), /EISDIR/)

    const directoryInfo = await provider.stat('state')
    assert.strictEqual(directoryInfo.isFile, false)
    assert.strictEqual(directoryInfo.isDirectory, true)

    await provider.writeFile('state/events.jsonl', 'event')
    await assert.rejects(
      () => provider.mkdir('state/events.jsonl', false),
      /EEXIST/
    )
  })

  it('removes files and directories with force and recursive semantics', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/workspace/context.json', '{}')

    await assert.rejects(
      () => provider.rm('state/workspace', false, false),
      /Directory not empty: state\/workspace/
    )

    await provider.rm('state/missing.json', false, true)
    await provider.rm('state/workspace', true, false)

    assert.strictEqual(
      await provider.exists('state/workspace/context.json'),
      false
    )
    assert.strictEqual(await provider.exists('state/workspace'), false)
  })

  it('renames files and directories', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/events.jsonl', 'event')
    await provider.rename('state/events.jsonl', 'state/archive/events.jsonl')

    assert.strictEqual(await provider.exists('state/events.jsonl'), false)
    assert.strictEqual(
      await provider.readFile('state/archive/events.jsonl'),
      'event'
    )

    await provider.writeFile('state/workspace/context.json', '{}')
    await provider.rename('state/workspace', 'state/snapshot')

    assert.strictEqual(
      await provider.exists('state/workspace/context.json'),
      false
    )
    assert.strictEqual(
      await provider.readFile('state/snapshot/context.json'),
      '{}'
    )
  })

  it('does not rename files over directories', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/events.jsonl', 'event')
    await provider.mkdir('state/archive', false)

    await assert.rejects(
      () => provider.rename('state/events.jsonl', 'state/archive'),
      {
        message: 'EISDIR: state/archive',
        code: 'EISDIR',
      }
    )

    assert.strictEqual(await provider.readFile('state/events.jsonl'), 'event')

    const directoryInfo = await provider.stat('state/archive')
    assert.strictEqual(directoryInfo.isDirectory, true)
  })

  it('does not merge directory renames into existing directories', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/workspace/context.json', '{}')
    await provider.writeFile('state/snapshot/existing.json', 'existing')

    await assert.rejects(
      () => provider.rename('state/workspace', 'state/snapshot'),
      {
        message: 'EEXIST: state/snapshot',
        code: 'EEXIST',
      }
    )

    assert.strictEqual(
      await provider.readFile('state/workspace/context.json'),
      '{}'
    )
    assert.strictEqual(
      await provider.readFile('state/snapshot/existing.json'),
      'existing'
    )
    assert.strictEqual(
      await provider.exists('state/snapshot/context.json'),
      false
    )
  })

  it('does not rename directories into their own subtree', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/workspace/context.json', '{}')

    await assert.rejects(
      () => provider.rename('state/workspace', 'state/workspace/nested'),
      {
        message: 'EINVAL: state/workspace/nested',
        code: 'EINVAL',
      }
    )

    assert.strictEqual(
      await provider.readFile('state/workspace/context.json'),
      '{}'
    )
    assert.strictEqual(
      await provider.exists('state/workspace/nested/context.json'),
      false
    )
  })

  it('treats renaming a path to itself as a no-op', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await provider.writeFile('state/events.jsonl', 'event')
    await provider.rename('state/events.jsonl', 'state/events.jsonl')

    assert.strictEqual(await provider.readFile('state/events.jsonl'), 'event')

    await provider.writeFile('state/workspace/context.json', '{}')
    await provider.rename('state/workspace', 'state/workspace')

    assert.strictEqual(
      await provider.readFile('state/workspace/context.json'),
      '{}'
    )
  })

  it('throws ENOENT errors for missing required paths', async () => {
    const provider = createCopilotInMemorySessionFsProvider()

    await assert.rejects(provider.readFile('missing'), {
      message: 'ENOENT: missing',
      code: 'ENOENT',
    })
    await assert.rejects(provider.stat('missing'), {
      message: 'ENOENT: missing',
      code: 'ENOENT',
    })
    await assert.rejects(provider.readdir('missing'), {
      message: 'ENOENT: missing',
      code: 'ENOENT',
    })
    await assert.rejects(provider.rename('missing', 'state/missing'), {
      message: 'ENOENT: missing',
      code: 'ENOENT',
    })
  })
})
