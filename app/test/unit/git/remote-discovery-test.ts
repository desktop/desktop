import assert from 'node:assert'
import { describe, it } from 'node:test'
import { writeFile } from 'node:fs/promises'
import * as Path from 'node:path'

import { git } from '../../../src/lib/git/core'
import { getRemotes, getRemoteURL } from '../../../src/lib/git/remote'
import { setConfigValue } from '../../../src/lib/git/config'
import {
  setupEmptyDirectory,
  setupEmptyRepository,
} from '../../helpers/repositories'

describe('git/remote discovery', () => {
  for (const [description, separator] of [
    ['line separator', '\u2028'],
    ['paragraph separator', '\u2029'],
    ['tab', '\t'],
    ['carriage return', '\r'],
    ['line feed', '\n'],
    ['CRLF', '\r\n'],
  ]) {
    it(`preserves a URL containing a ${description}`, async t => {
      const repository = await setupEmptyRepository(t)
      const url = `/path/with${separator}more\t/another-path (fetch)`
      await setConfigValue(repository, 'remote.origin.url', url)

      assert.deepStrictEqual(await getRemotes(repository), [
        { name: 'origin', url },
      ])
    })
  }

  it('preserves whitespace at both ends of a URL', async t => {
    const repository = await setupEmptyRepository(t)
    const url = ' \t/path/with spaces\t \r\n'
    await setConfigValue(repository, 'remote.origin.url', url)

    assert.deepStrictEqual(await getRemotes(repository), [
      { name: 'origin', url },
    ])
    assert.strictEqual(await getRemoteURL(repository, 'origin'), url)
  })

  it('returns each configured remote once in alphabetical order', async t => {
    const repository = await setupEmptyRepository(t)
    const names = ['z-last', 'origin', 'has.dots', '--remote', 'A']
    for (const name of names) {
      await setConfigValue(repository, `remote.${name}.url`, `/fetch/${name}`)
      await git(
        ['config', '--add', `remote.${name}.url`, `/second/${name}`],
        repository.path,
        'add another fetch URL'
      )
      await setConfigValue(
        repository,
        `remote.${name}.pushurl`,
        `/push/${name}`
      )
    }

    assert.deepStrictEqual(
      await getRemotes(repository),
      names.sort().map(name => ({ name, url: `/fetch/${name}` }))
    )
  })

  it('preserves separators in configured remote names', async t => {
    const repository = await setupEmptyRepository(t)
    const name = 'remote\u2028with\u2029separators\tand.dots'
    await setConfigValue(repository, `remote.${name}.url`, '/fetch')

    assert.deepStrictEqual(await getRemotes(repository), [
      { name, url: '/fetch' },
    ])
  })

  it('resolves fetch URL rewrites without using the push URL', async t => {
    const repository = await setupEmptyRepository(t)
    await setConfigValue(
      repository,
      'url./resolved/.insteadOf',
      'desktop-remote-test:'
    )
    await setConfigValue(
      repository,
      'url./longer-match/.insteadOf',
      'desktop-remote-test:project/'
    )
    await setConfigValue(
      repository,
      'remote.origin.url',
      'desktop-remote-test:project/repository'
    )
    await setConfigValue(repository, 'remote.origin.pushurl', '/push-only')

    assert.deepStrictEqual(await getRemotes(repository), [
      { name: 'origin', url: '/longer-match/repository' },
    ])
  })

  it('reads remotes and URL rewrites from included configuration', async t => {
    const repository = await setupEmptyRepository(t)
    const includedConfig = Path.join(repository.path, '.git', 'included-config')
    await writeFile(
      includedConfig,
      '[remote "included"]\nurl = desktop-remote-test:repository\n' +
        '[url "/resolved/"]\ninsteadOf = desktop-remote-test:\n'
    )
    await setConfigValue(repository, 'include.path', includedConfig)

    assert.deepStrictEqual(await getRemotes(repository), [
      { name: 'included', url: '/resolved/repository' },
    ])
  })

  it('reads global remotes only when inside a repository', async t => {
    const repository = await setupEmptyRepository(t)
    const globalConfig = Path.join(repository.path, '.git', 'global-config')
    await writeFile(globalConfig, '[remote "global"]\nurl = /global-fetch\n')
    const previousGlobalConfig = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = globalConfig
    t.after(() => {
      if (previousGlobalConfig === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL
      } else {
        process.env.GIT_CONFIG_GLOBAL = previousGlobalConfig
      }
    })

    assert.deepStrictEqual(await getRemotes(repository), [
      { name: 'global', url: '/global-fetch' },
    ])
    assert.deepStrictEqual(await getRemotes(await setupEmptyDirectory(t)), [])
  })

  it('returns partial clone URLs without display annotations', async t => {
    const repository = await setupEmptyRepository(t)
    await setConfigValue(repository, 'remote.origin.url', '/fetch')
    await setConfigValue(repository, 'remote.origin.promisor', 'true')
    await setConfigValue(
      repository,
      'remote.origin.partialclonefilter',
      'blob:none'
    )

    assert.deepStrictEqual(await getRemotes(repository), [
      { name: 'origin', url: '/fetch' },
    ])
  })

  it('omits remotes without a fetch URL', async t => {
    const repository = await setupEmptyRepository(t)
    await setConfigValue(repository, 'remote.empty.url', '')
    await setConfigValue(repository, 'remote.push-only.pushurl', '/push')
    await setConfigValue(
      repository,
      'remote.fetch-only.fetch',
      '+refs/heads/*:refs/remotes/fetch-only/*'
    )
    await setConfigValue(repository, 'remote.origin.url', '/fetch')

    assert.deepStrictEqual(await getRemotes(repository), [
      { name: 'origin', url: '/fetch' },
    ])
  })

  it('honors empty URL entries that reset previous URLs', async t => {
    const repository = await setupEmptyRepository(t)
    for (const name of ['cleared', 'replaced']) {
      for (const url of ['/original', '']) {
        await git(
          ['config', '--add', `remote.${name}.url`, url],
          repository.path,
          'configure remote URL'
        )
      }
    }
    await git(
      ['config', '--add', 'remote.replaced.url', '/replacement'],
      repository.path,
      'configure replacement URL'
    )

    assert.deepStrictEqual(await getRemotes(repository), [
      { name: 'replaced', url: '/replacement' },
    ])
  })

  it('returns no remotes for an empty repository', async t => {
    const repository = await setupEmptyRepository(t)
    assert.deepStrictEqual(await getRemotes(repository), [])
  })

  it('returns no remotes outside a repository', async t => {
    const repository = await setupEmptyDirectory(t)
    assert.deepStrictEqual(await getRemotes(repository), [])
  })

  it('reports invalid repository configuration', async t => {
    const repository = await setupEmptyRepository(t)
    await writeFile(Path.join(repository.path, '.git', 'config'), '[invalid')

    await assert.rejects(getRemotes(repository), /bad config/)
    await assert.rejects(getRemoteURL(repository, 'origin'), /bad config/)
  })

  it('reports a remote URL without a configured value', async t => {
    const repository = await setupEmptyRepository(t)
    await writeFile(
      Path.join(repository.path, '.git', 'config'),
      '[remote "origin"]\nurl\n'
    )

    await assert.rejects(
      getRemotes(repository),
      /Remote URL configuration is missing a value/
    )
  })
})
