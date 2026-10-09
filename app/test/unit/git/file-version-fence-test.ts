import assert from 'node:assert'
import { describe, it } from 'node:test'
import { link, mkdir, readFile, rename, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  captureFileVersionFence,
  captureMutableFileRoutingFence,
  captureMutableTreeRoutingFence,
  captureObjectDirectoryRoutingFence,
} from '../../../src/lib/git/file-version-fence'
import { createTempDirectory } from '../../helpers/temp'

describe('push backing file version fence', () => {
  it('refuses object routing beyond 4096 entries instead of synchronously scanning an unbounded store', async t => {
    const root = await createTempDirectory(t)
    const objects = join(root, 'objects')
    await mkdir(objects)
    for (let offset = 0; offset < 4096; offset += 256) {
      await Promise.all(
        Array.from({ length: 256 }, (_, index) =>
          writeFile(join(objects, `${offset + index}`), 'Immutable object\n')
        )
      )
    }
    await assert.rejects(
      captureObjectDirectoryRoutingFence([objects]),
      error =>
        error instanceof Error &&
        error.cause instanceof Error &&
        error.cause.message.includes('4096-entry certification budget')
    )
  })
  it('allows immutable object hard links and native object creation and replacement', async t => {
    const root = await createTempDirectory(t)
    const objects = join(root, 'objects')
    await mkdir(join(objects, 'ab'), { recursive: true })
    const foreign = join(await createTempDirectory(t), 'shared-object')
    await writeFile(foreign, 'Immutable object bytes\n')
    await link(foreign, join(objects, 'ab', 'shared'))
    const verify = await captureObjectDirectoryRoutingFence([objects])
    verify()
    await mkdir(join(objects, 'pack'))
    const packed = join(objects, 'pack', 'pack-example.pack')
    await writeFile(packed, 'Native pack bytes\n')
    verify()
    const replacement = join(objects, 'pack', 'temporary')
    await writeFile(replacement, 'Native replacement bytes\n')
    await rename(replacement, packed)
    verify()
    assert.strictEqual(
      await readFile(foreign, 'utf8'),
      'Immutable object bytes\n'
    )
  })

  for (const directory of ['pack', 'ab', 'info'] as const) {
    it(`refuses substituted object ${directory} directory routing`, async t => {
      const root = await createTempDirectory(t)
      const objects = join(root, 'objects')
      const foreign = await createTempDirectory(t)
      await mkdir(objects)
      const sentinel = join(foreign, 'foreign')
      await writeFile(sentinel, 'Foreign object bytes\n')
      const verify = await captureObjectDirectoryRoutingFence([objects])
      await symlink(foreign, join(objects, directory), 'junction')
      assert.throws(verify, /metadata changed/)
      assert.strictEqual(
        await readFile(sentinel, 'utf8'),
        'Foreign object bytes\n'
      )
    })
  }

  it('allows native ref and reflog creation, updates, replacement and directory recreation', async t => {
    const root = await createTempDirectory(t)
    const paths = [join(root, 'refs'), join(root, 'logs')]
    const verify = await captureMutableTreeRoutingFence(paths)
    verify()
    for (const path of paths) {
      await mkdir(join(path, 'heads'), { recursive: true })
      const branch = join(path, 'heads', 'main')
      await writeFile(branch, 'Original native metadata\n')
      verify()
      await writeFile(branch, 'Updated native metadata\n')
      verify()
      const replacement = join(path, 'heads', 'main.lock')
      await writeFile(replacement, 'Atomic native replacement\n')
      await rename(replacement, branch)
      verify()
      await rename(path, `${path}-old`)
      verify()
      await mkdir(path)
      verify()
    }
  })

  for (const tree of ['refs', 'logs'] as const) {
    it(`refuses nested ${tree} directory routing into another checkout`, async t => {
      const root = await createTempDirectory(t)
      const path = join(root, tree)
      const foreign = await createTempDirectory(t)
      const sentinel = join(foreign, 'main')
      await mkdir(path)
      await writeFile(sentinel, 'Foreign native metadata\n')
      const verify = await captureMutableTreeRoutingFence([path])
      await symlink(foreign, join(path, 'heads'), 'junction')
      assert.throws(verify, /metadata changed/)
      assert.strictEqual(
        await readFile(sentinel, 'utf8'),
        'Foreign native metadata\n'
      )
    })

    for (const kind of ['symlink', 'hardlink'] as const) {
      it(`refuses ${tree} leaf ${kind} routing into another owned file`, async t => {
        const root = await createTempDirectory(t)
        const path = join(root, tree)
        const foreign = join(await createTempDirectory(t), 'foreign')
        await mkdir(join(path, 'heads'), { recursive: true })
        await writeFile(foreign, 'Foreign native metadata\n')
        const verify = await captureMutableTreeRoutingFence([path])
        const branch = join(path, 'heads', 'main')
        if (kind === 'symlink') {
          await symlink(foreign, branch, 'file')
        } else {
          await link(foreign, branch)
        }
        assert.throws(verify, /metadata changed/)
        assert.strictEqual(
          await readFile(foreign, 'utf8'),
          'Foreign native metadata\n'
        )
      })
    }
  }

  it('allows native mutable metadata creation, content changes and owned inode replacement', async t => {
    const root = await createTempDirectory(t)
    const path = join(root, 'FETCH_HEAD')
    const verify = await captureMutableFileRoutingFence([path])
    await writeFile(path, 'First fetch\n')
    verify()
    await writeFile(path, 'Later fetch\n')
    verify()
    const replacement = join(root, 'owned-replacement')
    await writeFile(replacement, 'Atomic native replacement\n')
    await rename(replacement, path)
    verify()
  })

  for (const kind of ['symlink', 'hardlink'] as const) {
    it(`refuses mutable metadata ${kind} routing into another owned file`, async t => {
      const root = await createTempDirectory(t)
      const path = join(root, 'index')
      const foreign = join(await createTempDirectory(t), 'foreign-index')
      await writeFile(path, 'Original index\n')
      await writeFile(foreign, 'Foreign index\n')
      const verify = await captureMutableFileRoutingFence([path])
      await rename(path, join(root, 'original-index'))
      if (kind === 'symlink') {
        await symlink(foreign, path, 'file')
      } else {
        await link(foreign, path)
      }
      assert.throws(verify, /metadata changed/)
    })
  }

  for (const change of ['edit-target', 'replace-target'] as const) {
    it(`rejects ${change} behind an unchanged configuration symlink`, async t => {
      const root = await createTempDirectory(t)
      const target = join(root, 'actual-config')
      const link = join(root, 'config-link')
      await writeFile(target, '[remote "origin"]\nurl = before\n')
      await symlink(target, link, 'file')
      const verify = await captureFileVersionFence([link])
      if (change === 'replace-target') {
        await rename(target, join(root, 'old-config'))
      }
      await writeFile(target, '[url "after"]\ninsteadOf = before\n')
      assert.throws(verify, /metadata changed/)
    })
  }
})
