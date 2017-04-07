import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { API,  IAPIUser, getDotComAPIEndpoint } from '../../lib/api'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Select } from '../lib/select'

interface IPublishRepositoryProps {
  readonly dispatcher: Dispatcher

  /** The repository to publish. */
  readonly repository: Repository

  /** The signed in users. */
  readonly users: ReadonlyArray<Account>
}

interface IPublishRepositoryState {
  readonly name: string
  readonly description: string
  readonly private: boolean
  readonly groupedUsers: Map<Account, ReadonlyArray<IAPIUser>>
  readonly selectedUser: IAPIUser
}

/** The Publish Repository component. */
export class PublishRepository extends React.Component<IPublishRepositoryProps, IPublishRepositoryState> {
  public constructor(props: IPublishRepositoryProps) {
    super(props)

    this.state = {
      name: props.repository.name,
      description: '',
      private: true,
      groupedUsers: new Map<Account, ReadonlyArray<IAPIUser>>(),
      selectedUser: accountToAPIUser(this.props.users[0]),
    }
  }

  public async componentWillMount() {
    const orgsByUser = new Map<Account, ReadonlyArray<IAPIUser>>()
    for (const user of this.props.users) {
      const api = new API(user)
      const orgs = await api.fetchOrgs()
      orgsByUser.set(user, orgs)
    }

    this.setState({
      name: this.state.name,
      description: this.state.description,
      private: this.state.private,
      groupedUsers: orgsByUser,
      selectedUser: this.state.selectedUser,
    })
  }

  private onNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      name: event.currentTarget.value,
      description: this.state.description,
      private: this.state.private,
      groupedUsers: this.state.groupedUsers,
      selectedUser: this.state.selectedUser,
    })
  }

  private onDescriptionChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      name: this.state.name,
      description: event.currentTarget.value,
      private: this.state.private,
      groupedUsers: this.state.groupedUsers,
      selectedUser: this.state.selectedUser,
    })
  }

  private onPrivateChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      name: this.state.name,
      description: this.state.description,
      private: event.currentTarget.checked,
      groupedUsers: this.state.groupedUsers,
      selectedUser: this.state.selectedUser,
    })
  }

  private findOwningUserForSelectedUser(): Account | null {
    const selectedUser = this.state.selectedUser
    for (const [ user, orgs ] of this.state.groupedUsers) {
      const apiUser = accountToAPIUser(user)
      if (apiUser.id === selectedUser.id && apiUser.url === selectedUser.url) {
        return user
      }

      let owningAccount: Account | null = null
      orgs.forEach(org => {
        if (org.id === selectedUser.id && org.url === selectedUser.url) {
          owningAccount = user
        }
      })

      if (owningAccount) {
        return owningAccount
      }
    }

    return null
  }

  private get selectedOrg(): IAPIUser | null {
    if (this.state.selectedUser.type === 'user') { return null }

    return this.state.selectedUser
  }

  private publishRepository = () => {
    const owningAccount = this.findOwningUserForSelectedUser()!
    this.props.dispatcher.publishRepository(this.props.repository, this.state.name, this.state.description, this.state.private, owningAccount, this.selectedOrg)
    this.props.dispatcher.closeFoldout()
  }

  private onAccountChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    const selectedUser = JSON.parse(value)

    this.setState({
      name: this.state.name,
      description: this.state.description,
      private: this.state.private,
      groupedUsers: this.state.groupedUsers,
      selectedUser,
    })
  }

  private renderAccounts() {
    const optionGroups = new Array<JSX.Element>()
    for (const user of this.state.groupedUsers.keys()) {
      const orgs = this.state.groupedUsers.get(user)!
      const label = user.endpoint === getDotComAPIEndpoint() ? 'GitHub.com' : user.endpoint
      const options = [
        <option value={JSON.stringify(accountToAPIUser(user))} key={user.login}>{user.login}</option>,
        ...orgs.map((u, i) => <option value={JSON.stringify(u)} key={u.login}>{u.login}</option>),
      ]
      optionGroups.push(
        <optgroup key={user.endpoint} label={label}>
          {options}
        </optgroup>
      )
    }

    const value = JSON.stringify(this.state.selectedUser)

    return (
      <Select label='Account' value={value} onChange={this.onAccountChange}>
        {optionGroups}
      </Select>
    )
  }

  public render() {
    const disabled = !this.state.name.length
    return (
      <Form className='publish-repository' onSubmit={this.publishRepository}>
        <TextBox label='Name' value={this.state.name} autoFocus={true} onChange={this.onNameChange}/>

        <TextBox label='Description' value={this.state.description} onChange={this.onDescriptionChange}/>

        <hr/>

        <label>
          Keep this code private
          <input type='checkbox' checked={this.state.private} onChange={this.onPrivateChange}/>
        </label>

        {this.renderAccounts()}

        <Button type='submit' disabled={disabled}>Publish Repository</Button>
      </Form>
    )
  }
}

function accountToAPIUser(account: Account): IAPIUser {
  return {
    login: account.login,
    avatarUrl: account.avatarURL,
    type: 'user',
    id: account.id,
    url: account.endpoint,
    name: account.name,
  }
}
