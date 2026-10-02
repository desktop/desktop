import * as React from 'react'
import { Account } from '../models/account'
import { Repository } from '../models/repository'
import { getHTMLURL } from '../lib/api'
import { Dialog, DialogContent, DialogError, DialogFooter } from './dialog'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from './lib/checkbox'
import { repositoryIsOnAccountHost } from '../lib/repository-account-host'

interface IProps {
  readonly account: Account
  readonly repositories: ReadonlyArray<Repository>
  readonly knownAccounts: ReadonlyArray<Account>
  readonly onAssign: (
    repository: Repository,
    account: Account
  ) => Promise<Repository>
  readonly onDismissed: () => void
}

interface IState {
  readonly selected: ReadonlySet<number>
  readonly eligible: ReadonlySet<number>
  readonly saving: boolean
  readonly error: string | null
}

/** Review all repositories on the newly added account's host before reassignment. */
export class RepositoryAccountManagement extends React.Component<
  IProps,
  IState
> {
  private mounted = false

  public constructor(props: IProps) {
    super(props)
    this.state = {
      selected: new Set(),
      eligible: new Set(
        props.repositories
          .filter(
            repository =>
              repository.gitHubRepository?.endpoint === props.account.endpoint
          )
          .map(repository => repository.id)
      ),
      saving: false,
      error: null,
    }
  }

  public async componentDidMount() {
    this.mounted = true
    try {
      const matches = await Promise.all(
        this.props.repositories
          .filter(repository => repository.gitHubRepository === null)
          .map(async repository =>
            (await repositoryIsOnAccountHost(repository, this.props.account))
              ? repository.id
              : null
          )
      )
      if (this.mounted) {
        this.setState(state => ({
          eligible: new Set([
            ...state.eligible,
            ...matches.filter((id): id is number => id !== null),
          ]),
        }))
      }
    } catch (error) {
      log.error(
        'Could not read repository remotes for account management',
        error
      )
      if (this.mounted) {
        this.setState({ error: String(error) })
      }
    }
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private onSelectionChanged =
    (id: number) => (event: React.FormEvent<HTMLInputElement>) => {
      const selected = new Set(this.state.selected)
      if (event.currentTarget.checked) {
        selected.add(id)
      } else {
        selected.delete(id)
      }
      this.setState({ selected })
    }

  private onSubmit = async () => {
    this.setState({ saving: true, error: null })
    try {
      for (const repository of this.props.repositories) {
        if (this.state.selected.has(repository.id)) {
          await this.props.onAssign(repository, this.props.account)
        }
      }
      this.props.onDismissed()
    } catch (error) {
      log.error('Could not assign repositories to account', error)
      this.setState({ error: String(error), saving: false })
    }
  }

  public render() {
    const repositories = this.props.repositories.filter(repository =>
      this.state.eligible.has(repository.id)
    )
    return (
      <Dialog
        id="repository-account-management"
        title={`Manage repositories for @${this.props.account.login}`}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        disabled={this.state.saving}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error}</DialogError>
        )}
        <DialogContent>
          <p>
            Choose which repositories on{' '}
            {getHTMLURL(this.props.account.endpoint)} to associate with @
            {this.props.account.login}. Other associations will stay as they
            are.
          </p>
          {repositories.map(repository => {
            const onChange = this.onSelectionChanged(repository.id)
            const identity = repository.accountIdentity
            const current = this.props.knownAccounts.find(
              account =>
                account.endpoint === identity?.endpoint &&
                account.id === identity?.id
            )
            return (
              <div key={repository.id}>
                <Checkbox
                  label={`${
                    repository.gitHubRepository?.fullName ?? repository.name
                  } - ${
                    current === undefined ? 'Unassociated' : `@${current.login}`
                  }`}
                  value={
                    this.state.selected.has(repository.id)
                      ? CheckboxValue.On
                      : CheckboxValue.Off
                  }
                  onChange={onChange}
                />
              </div>
            )
          })}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Assign repositories"
            okButtonDisabled={this.state.selected.size === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
