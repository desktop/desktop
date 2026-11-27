import * as React from 'react'
import memoizeOne from 'memoize-one'
import {
  getAccountRepositoryChanges,
  getInitialAccountRepositorySelection,
  getRepositoriesForAccountHost,
} from '../../lib/account-repositories'
import { Account, isSameAccount } from '../../models/account'
import {
  Repository,
  RepositoryWithGitHubRepository,
  getRepositoryAccountIdentity,
} from '../../models/repository'
import {
  DefaultDialogFooter,
  Dialog,
  DialogContent,
  DialogError,
  DialogFooter,
} from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TextBox } from '../lib/text-box'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IManageAccountRepositoriesDialogProps {
  readonly account: Account
  readonly accounts: ReadonlyArray<Account>
  readonly repositories: ReadonlyArray<Repository>
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IManageAccountRepositoriesDialogState {
  readonly selected: ReadonlySet<number>
  readonly filterText: string
  readonly isSubmitting: boolean
  readonly error: string | null
}

/**
 * Describe a repository's current account assignment relative to the account
 * being managed.
 */
export function describeRepositoryAccount(
  repository: Repository,
  account: Account,
  accounts: ReadonlyArray<Account>
): string {
  const identity = getRepositoryAccountIdentity(repository)
  if (identity === null) {
    return 'Unassigned'
  }
  if (isSameAccount(account, identity)) {
    return `@${identity.login} (this account)`
  }
  return accounts.some(a => isSameAccount(a, identity))
    ? `@${identity.login}`
    : `@${identity.login} (signed out)`
}

function matchesFilter(
  repository: RepositoryWithGitHubRepository,
  filter: string
) {
  return [
    repository.name,
    repository.gitHubRepository.fullName,
    repository.alias ?? '',
    repository.path,
  ].some(value => value.toLowerCase().includes(filter))
}

/** How a repository is currently assigned relative to the managed account. */
type RepositoryAssignment = 'unassigned' | 'this-account' | 'other-account'

function getRepositoryAssignment(
  repository: Repository,
  account: Account
): RepositoryAssignment {
  const identity = getRepositoryAccountIdentity(repository)
  if (identity === null) {
    return 'unassigned'
  }
  return isSameAccount(account, identity) ? 'this-account' : 'other-account'
}

interface IAccountRepositoryRowProps {
  readonly repository: RepositoryWithGitHubRepository
  readonly association: string
  readonly assignment: RepositoryAssignment
  readonly selected: boolean
  readonly onChange: (
    repository: RepositoryWithGitHubRepository,
    selected: boolean
  ) => void
}

class AccountRepositoryRow extends React.Component<IAccountRepositoryRowProps> {
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onChange(this.props.repository, event.currentTarget.checked)
  }

  public render() {
    const { repository, association, assignment, selected } = this.props
    const descriptionId = `manage-account-repository-${repository.id}`
    return (
      <li className="account-repository">
        <Checkbox
          value={selected ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onChange}
          ariaDescribedBy={descriptionId}
          label={repository.alias ?? repository.name}
        />
        <div id={descriptionId} className="account-repository-details">
          <span className="account-repository-full-name">
            {repository.gitHubRepository.fullName}
          </span>
          <span className={`account-repository-association ${assignment}`}>
            {assignment !== 'unassigned' && (
              <Octicon symbol={octicons.person} />
            )}
            {association}
          </span>
        </div>
      </li>
    )
  }
}

/** Assigns the account to the selected repositories on its host. */
export class ManageAccountRepositoriesDialog extends React.Component<
  IManageAccountRepositoriesDialogProps,
  IManageAccountRepositoriesDialogState
> {
  private getHostRepositories = memoizeOne(
    (repositories: ReadonlyArray<Repository>, account: Account) =>
      getRepositoriesForAccountHost(repositories, account)
  )

  private getFilteredRepositories = memoizeOne(
    (
      repositories: ReadonlyArray<RepositoryWithGitHubRepository>,
      filterText: string
    ) => {
      const filter = filterText.trim().toLowerCase()
      return filter.length === 0
        ? repositories
        : repositories.filter(r => matchesFilter(r, filter))
    }
  )

  public constructor(props: IManageAccountRepositoriesDialogProps) {
    super(props)
    this.state = {
      selected: getInitialAccountRepositorySelection(
        getRepositoriesForAccountHost(props.repositories, props.account),
        props.account
      ),
      filterText: '',
      isSubmitting: false,
      error: null,
    }
  }

  private get hostRepositories() {
    return this.getHostRepositories(this.props.repositories, this.props.account)
  }

  private get filteredRepositories() {
    return this.getFilteredRepositories(
      this.hostRepositories,
      this.state.filterText
    )
  }

  private get hasChanges() {
    return (
      getAccountRepositoryChanges(
        this.hostRepositories,
        this.props.account,
        this.state.selected
      ).length > 0
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private setSelected(ids: ReadonlyArray<number>, selected: boolean) {
    this.setState(state => {
      const next = new Set(state.selected)
      for (const id of ids) {
        if (selected) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return { selected: next }
    })
  }

  private onSelectAll = () => {
    this.setSelected(
      this.filteredRepositories.map(r => r.id),
      true
    )
  }

  private onSelectNone = () => {
    this.setSelected(
      this.filteredRepositories.map(r => r.id),
      false
    )
  }

  private onSubmit = async () => {
    const { account, dispatcher } = this.props
    const shown = new Set(this.hostRepositories.map(r => r.id))
    this.setState({ isSubmitting: true, error: null })
    try {
      await dispatcher.updateAccountRepositories(
        account,
        shown,
        this.state.selected
      )
    } catch (e) {
      this.setState({
        isSubmitting: false,
        error: e instanceof Error ? e.message : String(e),
      })
      return
    }
    this.props.onDismissed()
  }

  private onRepositoryChanged = (
    repository: RepositoryWithGitHubRepository,
    selected: boolean
  ) => {
    this.setSelected([repository.id], selected)
  }

  private renderRepository = (repository: RepositoryWithGitHubRepository) => (
    <AccountRepositoryRow
      key={repository.id}
      repository={repository}
      association={describeRepositoryAccount(
        repository,
        this.props.account,
        this.props.accounts
      )}
      assignment={getRepositoryAssignment(repository, this.props.account)}
      selected={this.state.selected.has(repository.id)}
      onChange={this.onRepositoryChanged}
    />
  )

  private renderEmpty() {
    return (
      <p>
        There are no repositories on {this.props.account.friendlyEndpoint} to
        assign to @{this.props.account.login}.
      </p>
    )
  }

  private renderRepositories() {
    const { account } = this.props
    const repositories = this.filteredRepositories
    const total = this.hostRepositories.length
    const selectedCount = this.hostRepositories.filter(r =>
      this.state.selected.has(r.id)
    ).length
    return (
      <>
        <p>
          Choose the repositories on {account.friendlyEndpoint} that should use
          @{account.login} for GitHub API requests and HTTPS authentication.
          This does not change your Git remotes, author name, or email.
        </p>
        <TextBox
          className="account-repositories-filter"
          type="search"
          placeholder="Filter repositories"
          ariaLabel="Filter repositories"
          prefixedIcon={octicons.search}
          value={this.state.filterText}
          onValueChanged={this.onFilterTextChanged}
          displayClearButton={true}
        />
        <div className="account-repositories-box">
          <div className="account-repositories-header">
            <span className="account-repositories-count">
              {selectedCount} of {total} selected
            </span>
            <Button size="small" onClick={this.onSelectAll}>
              Select all
            </Button>
            <Button size="small" onClick={this.onSelectNone}>
              Select none
            </Button>
          </div>
          {repositories.length === 0 ? (
            <p className="account-repositories-no-matches">
              No repositories match your filter.
            </p>
          ) : (
            <ul
              className="account-repositories-list"
              aria-label={`Repositories on ${account.friendlyEndpoint}`}
            >
              {repositories.map(this.renderRepository)}
            </ul>
          )}
        </div>
        <p className="account-repositories-note">
          Unselecting a repository assigned to @{account.login} leaves it
          unassigned; other unselected repositories keep their current account.
        </p>
      </>
    )
  }

  public render() {
    const isEmpty = this.hostRepositories.length === 0
    const { isSubmitting, error } = this.state
    return (
      <Dialog
        id="manage-account-repositories"
        title={`Manage repositories for @${this.props.account.login}`}
        onDismissed={this.props.onDismissed}
        onSubmit={isEmpty ? this.props.onDismissed : this.onSubmit}
        loading={isSubmitting}
        disabled={isSubmitting}
      >
        {error !== null && <DialogError>{error}</DialogError>}
        <DialogContent>
          {isEmpty ? this.renderEmpty() : this.renderRepositories()}
        </DialogContent>
        {isEmpty ? (
          <DefaultDialogFooter />
        ) : (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="Assign selected"
              okButtonDisabled={!this.hasChanges}
            />
          </DialogFooter>
        )}
      </Dialog>
    )
  }
}
