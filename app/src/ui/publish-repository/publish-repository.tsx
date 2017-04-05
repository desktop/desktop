import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'
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
  readonly users: ReadonlyArray<User>
}

interface IPublishRepositoryState {
  readonly name: string
  readonly description: string
  readonly private: boolean
  readonly groupedUsers: Map<User, ReadonlyArray<IAPIUser>>
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
      groupedUsers: new Map<User, ReadonlyArray<IAPIUser>>(),
      selectedUser: userToAPIUser(this.props.users[0]),
    }
  }

  public async componentWillMount() {
    const orgsByUser = new Map<User, ReadonlyArray<IAPIUser>>()
    for (const user of this.props.users) {
      const api = new API(user)
      const orgs = await api.fetchOrgs()
      orgsByUser.set(user, orgs)
    }

    this.setState({ groupedUsers: orgsByUser })
  }

  private onNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ name: event.currentTarget.value })
  }

  private onDescriptionChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ description: event.currentTarget.value })
  }

  private onPrivateChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ private: event.currentTarget.checked })
  }

  private findOwningUserForSelectedUser(): User | null {
    const selectedUser = this.state.selectedUser
    for (const [ user, orgs ] of this.state.groupedUsers) {
      const apiUser = userToAPIUser(user)
      if (apiUser.id === selectedUser.id && apiUser.url === selectedUser.url) {
        return user
      }

      let owningAccount: User | null = null
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

    this.setState({ selectedUser })
  }

  private renderAccounts() {
    const optionGroups = new Array<JSX.Element>()
    for (const user of this.state.groupedUsers.keys()) {
      const orgs = this.state.groupedUsers.get(user)!
      const label = user.endpoint === getDotComAPIEndpoint() ? 'GitHub.com' : user.endpoint
      const options = [
        <option value={JSON.stringify(userToAPIUser(user))} key={user.login}>{user.login}</option>,
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

function userToAPIUser(user: User): IAPIUser {
  return {
    login: user.login,
    avatarUrl: user.avatarURL,
    type: 'user',
    id: user.id,
    url: user.endpoint,
    name: user.name,
  }
}
