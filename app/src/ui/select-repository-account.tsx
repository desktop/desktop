import * as React from 'react'
import { Account } from '../models/account'
import { Repository } from '../models/repository'
import { Dialog, DialogContent, DialogError, DialogFooter } from './dialog'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'
import { Select } from './lib/select'

interface IProps {
  readonly repository: Repository
  readonly accounts: ReadonlyArray<Account>
  readonly onAssign: (
    repository: Repository,
    account: Account
  ) => Promise<unknown>
  readonly onSelected: (account: Account | undefined) => void
  readonly onDismissed: () => void
}

interface IState {
  readonly selectedId: number | null
  readonly error: string | null
  readonly saving: boolean
}

/** Require an explicit account choice before an unassociated Git operation. */
export class SelectRepositoryAccount extends React.Component<IProps, IState> {
  public constructor(props: IProps) {
    super(props)
    this.state = { selectedId: null, error: null, saving: false }
  }

  private onChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const selectedId = Number(event.currentTarget.value)
    this.setState({
      selectedId: this.props.accounts.some(account => account.id === selectedId)
        ? selectedId
        : null,
    })
  }

  private onSubmit = async () => {
    const account = this.props.accounts.find(
      item => item.id === this.state.selectedId
    )
    if (account === undefined) {
      return
    }
    this.setState({ saving: true, error: null })
    try {
      await this.props.onAssign(this.props.repository, account)
      this.props.onSelected(account)
      this.props.onDismissed()
    } catch (error) {
      log.error('Could not select repository account', error)
      this.setState({ saving: false, error: String(error) })
    }
  }

  private onDismissed = () => {
    this.props.onSelected(undefined)
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="select-repository-account"
        title="Choose an account"
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
        disabled={this.state.saving}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error}</DialogError>
        )}
        <DialogContent>
          <p>Choose the account to use for {this.props.repository.name}.</p>
          <Select
            label="Account"
            value={this.state.selectedId?.toString() ?? ''}
            onChange={this.onChange}
          >
            <option value="">Choose an account</option>
            {this.props.accounts.map(account => (
              <option
                key={`${account.endpoint}/${account.id}`}
                value={account.id}
              >
                @{account.login}
              </option>
            ))}
          </Select>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Use account"
            okButtonDisabled={this.state.selectedId === null}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
