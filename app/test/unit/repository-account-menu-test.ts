import { describe, it } from 'node:test'
import assert from 'node:assert'
import { generateRepositoryListContextMenu } from '../../src/ui/repositories-list/repository-list-item-context-menu'
import { Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

const endpoint = 'https://api.github.com'
const account = (id: number) =>
  new Account(`person${id}`, endpoint, 'token', [], '', id, `Person ${id}`)
const repo = (accountId: number | null) =>
  new Repository(
    'repo',
    1,
    gitHubRepoFixture({ owner: 'organization', name: 'repo' }),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    accountId === null ? null : { endpoint, id: accountId }
  )

describe('repository account context menu', () => {
  it('offers a different signed-in account and marks the signed-out current account', () => {
    const selected: number[] = []
    const current = account(1)
    const other = account(2)
    const menu = makeMenu(
      repo(current.id),
      [other],
      [current.withToken(''), other.withToken('')],
      account => selected.push(account.id)
    )
    const accounts = menu.find(item => item.label === 'Accounts')
    assert.deepStrictEqual(
      accounts?.submenu?.map(item => [item.label, item.checked, item.enabled]),
      [
        ['@person2', false, true],
        ['@person1 (Signed out)', true, false],
      ]
    )
    accounts?.submenu?.[0].action?.()
    assert.deepStrictEqual(selected, [2])
  })

  it('hides the submenu when there is no alternative account', () => {
    const current = account(1)
    assert.strictEqual(
      makeMenu(repo(1), [current], [current], () => {}).some(
        item => item.label === 'Accounts'
      ),
      false
    )
    assert.strictEqual(
      makeMenu(repo(1), [], [current.withToken('')], () => {}).some(
        item => item.label === 'Accounts'
      ),
      false
    )
  })

  it('allows assignment from an unassociated repository without a No account entry', () => {
    const menu = makeMenu(repo(null), [account(1)], [account(1)], () => {})
    const accounts = menu.find(item => item.label === 'Accounts')
    assert.deepStrictEqual(
      accounts?.submenu?.map(item => item.label),
      ['@person1']
    )
  })
})

function makeMenu(
  repository: Repository,
  accounts: ReadonlyArray<Account>,
  knownAccounts: ReadonlyArray<Account>,
  onSelected: (account: Account) => void
) {
  return generateRepositoryListContextMenu({
    repository,
    accounts,
    knownAccounts,
    onSelectAccount: (_repo, account) => onSelected(account),
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
  })
}
