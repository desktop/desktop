import * as React from 'react'
import { Account } from '../models/account'
import { Repository } from '../models/repository'
import { getRepositoriesOnAccountHost } from '../lib/get-repositories-on-account-host'
import { Dialog, DialogContent, DialogError, DialogFooter } from './dialog'
import { DefaultDialogFooter } from './dialog/default-dialog-footer'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'

interface IManageAccountRepositoriesProps {
  readonly account: Account
  readonly repositories: ReadonlyArray<Repository>
  readonly knownAccounts: ReadonlyArray<Account>
  readonly remoteURLs?: ReadonlyMap<number, string>
  readonly onAssign: (repository: Repository, account: Account) => Promise<void>
  readonly onDismissed: () => void
}

interface IManageAccountRepositoriesState {
  readonly selectedIds: ReadonlySet<number>
  readonly submitting: boolean
  readonly error: string | null
}

/** Assign tracked repositories to an account. */
export class ManageAccountRepositories extends React.Component<
  IManageAccountRepositoriesProps,
  IManageAccountRepositoriesState
> {
  public constructor(props: IManageAccountRepositoriesProps) {
    super(props)
    this.state = { selectedIds: new Set(), submitting: false, error: null }
  }

  private onSelectionChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const id = Number(event.currentTarget.value)
    const checked = event.currentTarget.checked
    this.setState(state => {
      const selectedIds = new Set(state.selectedIds)
      if (checked) {
        selectedIds.add(id)
      } else {
        selectedIds.delete(id)
      }
      return { selectedIds }
    })
  }

  private onSubmit = async () => {
    this.setState({ submitting: true, error: null })
    try {
      for (const repository of this.hostRepositories) {
        if (this.state.selectedIds.has(repository.id)) {
          await this.props.onAssign(repository, this.props.account)
        }
      }
      this.props.onDismissed()
    } catch (error) {
      this.setState({ submitting: false, error: String(error) })
    }
  }

  private get hostRepositories() {
    return getRepositoriesOnAccountHost(
      this.props.account,
      this.props.repositories,
      this.props.remoteURLs
    )
  }

  private getAssociationLabel(repository: Repository): string {
    const identity = repository.accountIdentity
    if (identity == null) {
      return 'Unassociated'
    }

    const current = this.props.knownAccounts.find(
      account =>
        account.endpoint === identity.endpoint && account.id === identity.id
    )
    return current === undefined
      ? `Account ${identity.id}`
      : `@${current.login}${current.token === '' ? ' (Signed out)' : ''}`
  }

  public render() {
    const { submitting, selectedIds, error } = this.state
    const hostRepositories = this.hostRepositories
    return (
      <Dialog
        id="manage-account-repositories"
        title={`Manage repositories for @${this.props.account.login}`}
        onDismissed={this.props.onDismissed}
        onSubmit={
          hostRepositories.length === 0 ? this.props.onDismissed : this.onSubmit
        }
        disabled={submitting}
      >
        {error !== null && <DialogError>{error}</DialogError>}
        <DialogContent>
          {hostRepositories.length === 0 ? (
            <p>No repositories to assign on this host.</p>
          ) : (
            <p>
              Select repositories to associate with @{this.props.account.login}.
            </p>
          )}
          {hostRepositories.map(repository => (
            <label key={repository.id} className="repository-account-row">
              <input
                type="checkbox"
                value={repository.id}
                checked={selectedIds.has(repository.id)}
                onChange={this.onSelectionChanged}
              />
              <span>{repository.path}</span>
              <span>{this.getAssociationLabel(repository)}</span>
            </label>
          ))}
        </DialogContent>
        {hostRepositories.length === 0 ? (
          <DefaultDialogFooter />
        ) : (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="Assign selected"
              okButtonDisabled={selectedIds.size === 0}
            />
          </DialogFooter>
        )}
      </Dialog>
    )
  }
}
