import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import { Account } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { IMenuItem } from '../../../src/lib/menu-item'

const endpoint = 'https://ghe.example.com/api/v3'
const otherEndpoint = 'https://api.github.com'
const first = new Account('first', endpoint, 'token', [], '', 1, '')
const second = new Account('second', endpoint, 'token', [], '', 2, '')
const elsewhere = new Account('third', otherEndpoint, 'token', [], '', 3, '')
const github = new GitHubRepository('repo', new Owner('owner', endpoint, 1), 1)

const repository = (
  login: string | null,
  gitHubRepository: GitHubRepository | null = github
) =>
  new Repository(
    '/repo',
    1,
    gitHubRepository,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )

let generateRepositoryListContextMenu: typeof import('../../../src/ui/repositories-list/repository-list-item-context-menu').generateRepositoryListContextMenu

before(async () => {
  mock.module('../../../src/ui/main-process-proxy.ts', {
    namedExports: { writeClipboardText: () => {} },
  })
  ;({ generateRepositoryListContextMenu } = await import(
    '../../../src/ui/repositories-list/repository-list-item-context-menu'
  ))
})

const getAccountMenu = (
  repo: Repository,
  accounts: ReadonlyArray<Account>,
  onChangeRepositoryAccount = (_r: Repository, _l: string) => {}
): IMenuItem | undefined =>
  generateRepositoryListContextMenu({
    repository: repo,
    accounts,
    onChangeRepositoryAccount,
    shellLabel: undefined,
    externalEditorLabel: undefined,
    askForConfirmationOnRemoveRepository: false,
    onViewOnGitHub: () => {},
    onOpenInShell: () => {},
    onShowRepository: () => {},
    onOpenInExternalEditor: () => {},
    onRemoveRepository: () => {},
    onChangeRepositoryAlias: () => {},
    onRemoveRepositoryAlias: () => {},
  }).find(item => item.label === 'Account')

const describeItems = (menu: IMenuItem | undefined) =>
  menu?.submenu?.map(({ label, checked, enabled }) => ({
    label,
    checked,
    enabled,
  }))

describe('repository list context menu Account submenu', () => {
  it('lists eligible signed-in accounts on the repository host', () => {
    const menu = getAccountMenu(repository('first'), [first, second, elsewhere])
    assert.deepStrictEqual(describeItems(menu), [
      { label: '@first', checked: true, enabled: undefined },
      { label: '@second', checked: false, enabled: undefined },
    ])
  })

  it('does not offer a "No account" option', () => {
    const menu = getAccountMenu(repository(null), [first, second])
    assert.deepStrictEqual(
      menu?.submenu?.map(i => i.label),
      ['@first', '@second']
    )
    assert.ok(menu?.submenu?.every(i => i.checked === false))
  })

  it('shows a signed-out current account as checked and disabled', () => {
    const menu = getAccountMenu(repository('gone'), [first])
    assert.deepStrictEqual(describeItems(menu), [
      { label: '@gone (Signed out)', checked: true, enabled: false },
      { label: '@first', checked: false, enabled: undefined },
    ])
  })

  it('matches the assigned login case-insensitively', () => {
    const menu = getAccountMenu(repository('FIRST'), [first, second])
    assert.deepStrictEqual(
      menu?.submenu?.map(i => i.checked),
      [true, false]
    )
  })

  it('reassigns the repository when selecting another account', () => {
    const calls: Array<[Repository, string]> = []
    const repo = repository('first')
    const menu = getAccountMenu(repo, [first, second], (r, l) =>
      calls.push([r, l])
    )
    assert.strictEqual(menu?.submenu?.[0].action, undefined)
    menu?.submenu?.[1].action?.()
    assert.deepStrictEqual(calls, [[repo, 'second']])
  })

  it('is hidden when an associated repository has one retained identity', () => {
    assert.strictEqual(getAccountMenu(repository('first'), [first]), undefined)
    assert.strictEqual(getAccountMenu(repository('gone'), []), undefined)
    assert.strictEqual(
      getAccountMenu(repository('gone'), [elsewhere]),
      undefined
    )
  })

  it('is hidden when an unassociated repository has no eligible account', () => {
    assert.strictEqual(getAccountMenu(repository(null), [elsewhere]), undefined)
  })

  it('is shown for an unassociated repository with one eligible account', () => {
    const menu = getAccountMenu(repository(null), [first])
    assert.deepStrictEqual(
      menu?.submenu?.map(i => i.label),
      ['@first']
    )
  })

  it('is hidden for non-GitHub repositories', () => {
    assert.strictEqual(
      getAccountMenu(repository(null, null), [first, second]),
      undefined
    )
  })
})
