import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { findGitHubTrampolineAccount } from '../../src/lib/trampoline/find-account'
import { createCredentialHelperTrampolineHandler } from '../../src/lib/trampoline/trampoline-credential-helper'
import { TrampolineCommandIdentifier } from '../../src/lib/trampoline/trampoline-command'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { TestRepositoriesDatabase } from '../helpers/databases/test-repositories-database'
import { trampolineUIHelper } from '../../src/lib/trampoline/trampoline-ui-helper'
import { Popup, PopupType } from '../../src/models/popup'
import { Dispatcher } from '../../src/ui/dispatcher'
import { Repository } from '../../src/models/repository'
import {
  getTrampolineAccountIdentity,
  withTrampolineEnv,
} from '../../src/lib/trampoline/trampoline-environment'

describe('GitHub credential account selection', () => {
  const endpoint = 'https://api.github.com'
  const remote = 'https://github.com/owner/repository.git'

  async function accountsWithTwoIdentities() {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    const first = new Account('joan', endpoint, 'first', [], '', 1, '')
    const second = new Account('alex', endpoint, 'second', [], '', 2, '')
    await store.addAccount(first)
    await store.addAccount(second)
    return { store, first, second }
  }

  it('uses the selected account while cloning before a repository exists', async () => {
    const { store, second } = await accountsWithTwoIdentities()
    const db = new TestRepositoriesDatabase()
    await db.reset()
    const repositories = new RepositoriesStore(db)
    const identity = { endpoint, id: second.id }
    let token = ''

    try {
      await withTrampolineEnv(
        async environment => {
          token = (environment as { DESKTOP_TRAMPOLINE_TOKEN: string })
            .DESKTOP_TRAMPOLINE_TOKEN
          assert.deepStrictEqual(getTrampolineAccountIdentity(token), identity)
          const handler = createCredentialHelperTrampolineHandler(
            store,
            repositories
          )
          const output = await handler({
            identifier: TrampolineCommandIdentifier.CredentialHelper,
            trampolineToken: token,
            parameters: ['get'],
            environmentVariables: new Map(),
            stdin: 'protocol=https\nhost=github.com\n\n',
          })
          assert.match(output ?? '', /username=alex/)
        },
        process.cwd(),
        false,
        undefined,
        identity
      )
      assert.strictEqual(getTrampolineAccountIdentity(token), undefined)
    } finally {
      await db.delete()
    }
  })

  it('returns only the account associated with the repository', async () => {
    const { store, second } = await accountsWithTwoIdentities()

    assert.strictEqual(
      await findGitHubTrampolineAccount(store, remote, {
        endpoint,
        id: second.id,
      }),
      (await store.getAll())[1]
    )
  })

  it('does not use another account when the associated account is signed out', async () => {
    const { store, second } = await accountsWithTwoIdentities()
    await store.removeAccount(second)

    assert.strictEqual(
      await findGitHubTrampolineAccount(store, remote, {
        endpoint,
        id: second.id,
      }),
      undefined
    )
  })

  it('does not guess an account for an explicitly unassociated repository', async () => {
    const { store } = await accountsWithTwoIdentities()

    assert.strictEqual(
      await findGitHubTrampolineAccount(store, remote, null),
      undefined
    )
  })

  it('routes Git credentials using the repository associated with the Git operation', async () => {
    const { store, second } = await accountsWithTwoIdentities()
    const db = new TestRepositoriesDatabase()
    await db.reset()
    const repositories = new RepositoriesStore(db)
    const repository = await repositories.addRepository(
      process.cwd(),
      undefined
    )
    await repositories.setRepositoryAccount(repository, second)

    try {
      const handler = createCredentialHelperTrampolineHandler(
        store,
        repositories
      )
      const output = await handler({
        identifier: TrampolineCommandIdentifier.CredentialHelper,
        trampolineToken: 'test-token',
        parameters: ['get'],
        environmentVariables: new Map(),
        stdin: 'protocol=https\nhost=github.com\n\n',
      })

      assert.match(output ?? '', /username=alex/)
      assert.match(output ?? '', /password=second/)
    } finally {
      await db.delete()
    }
  })

  it('still uses generic authentication for an unassociated non-GitHub remote', async () => {
    const { store } = await accountsWithTwoIdentities()
    const db = new TestRepositoriesDatabase()
    await db.reset()
    const repositories = new RepositoriesStore(db)
    await repositories.addRepository(process.cwd(), undefined)
    const previousPrompt = trampolineUIHelper.promptForGenericGitAuthentication
    trampolineUIHelper.promptForGenericGitAuthentication = async endpoint => ({
      login: 'user',
      token: 'generic-secret',
      endpoint,
    })

    try {
      const handler = createCredentialHelperTrampolineHandler(
        store,
        repositories
      )
      const output = await handler({
        identifier: TrampolineCommandIdentifier.CredentialHelper,
        trampolineToken: 'test-token',
        parameters: ['get'],
        environmentVariables: new Map(),
        stdin:
          'protocol=https\nhost=gitlab.example.com\nwwwauth[0]=Basic realm="GitLab"\n\n',
      })

      assert.match(output ?? '', /username=user/)
      assert.match(output ?? '', /password=generic-secret/)
    } finally {
      trampolineUIHelper.promptForGenericGitAuthentication = previousPrompt
      await db.delete()
    }
  })

  it('asks for an account when an unassociated repository needs HTTPS credentials', async () => {
    const { store, first, second } = await accountsWithTwoIdentities()
    const db = new TestRepositoriesDatabase()
    await db.reset()
    const repositories = new RepositoriesStore(db)
    await repositories.addRepository(process.cwd(), undefined)
    let prompted = false
    trampolineUIHelper.setDispatcher({
      showPopup: (popup: Popup) => {
        assert.strictEqual(popup.type, PopupType.ChooseRepositoryAccount)
        if (popup.type !== PopupType.ChooseRepositoryAccount) {
          return
        }
        prompted = true
        assert.deepStrictEqual(popup.accounts, [first, second])
        void popup.onSelected(second)
      },
      setRepositoryAccount: (repository: Repository, account: Account | null) =>
        repositories.setRepositoryAccount(repository, account),
    } as unknown as Dispatcher)

    try {
      const handler = createCredentialHelperTrampolineHandler(
        store,
        repositories
      )
      const output = await handler({
        identifier: TrampolineCommandIdentifier.CredentialHelper,
        trampolineToken: 'test-token',
        parameters: ['get'],
        environmentVariables: new Map(),
        stdin: 'protocol=https\nhost=github.com\n\n',
      })

      assert.strictEqual(prompted, true)
      assert.match(output ?? '', /username=alex/)
      assert.deepStrictEqual((await repositories.getAll())[0].accountIdentity, {
        endpoint,
        id: second.id,
      })
    } finally {
      await db.delete()
    }
  })
})
