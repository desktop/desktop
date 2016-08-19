import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import User from '../../models/user'
import API, { IAPIUser, getDotComAPIEndpoint } from '../../lib/api'

interface IPublishRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly users: ReadonlyArray<User>
}

interface IPublishRepositoryState {
  readonly name: string
  readonly description: string
  readonly private: boolean
  readonly groupedUsers: Map<User, ReadonlyArray<IAPIUser>>
  readonly selectedUser: IAPIUser
}

export default class PublishRepository extends React.Component<IPublishRepositoryProps, IPublishRepositoryState> {
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
    for (const user of Array.from(this.props.users)) {
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

  private onNameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      name: event.target.value,
      description: this.state.description,
      private: this.state.private,
      groupedUsers: this.state.groupedUsers,
      selectedUser: this.state.selectedUser,
    })
  }

  private onDescriptionChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      name: this.state.name,
      description: event.target.value,
      private: this.state.private,
      groupedUsers: this.state.groupedUsers,
      selectedUser: this.state.selectedUser,
    })
  }

  private onPrivateChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      name: this.state.name,
      description: this.state.description,
      private: event.target.checked,
      groupedUsers: this.state.groupedUsers,
      selectedUser: this.state.selectedUser,
    })
  }

  private publishRepository(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    this.props.dispatcher.closePopup()
  }

  private onAccountChange(event: React.FormEvent<HTMLSelectElement>) {
    const value = event.target.value
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
        <option value={JSON.stringify(userToAPIUser(user))} key={user.login}>{user.login}</option>,
        ...orgs.map((u, i) => <option value={JSON.stringify(u)} key={u.login}>{u.login}</option>),
      ]
      optionGroups.push(
        <optgroup key={user.endpoint} label={label}>
          {options}
        </optgroup>
      )
    }

    return (
      <select value={JSON.stringify(this.state.selectedUser)} onChange={event => this.onAccountChange(event)}>
        {optionGroups}
      </select>
    )
  }

  public render() {
    const disabled = !this.state.name.length
    return (
      <form id='publish-repository' className='panel' onSubmit={event => this.publishRepository(event)}>
        <label>
          Name:
          <input type='text' value={this.state.name} autoFocus={true} onChange={event => this.onNameChange(event)}/>
        </label>

        <label>
          Description:
          <input type='text' value={this.state.description} onChange={event => this.onDescriptionChange(event)}/>
        </label>

        <hr/>

        <label>
          Keep this code private
          <input type='checkbox' checked={this.state.private} onChange={event => this.onPrivateChange(event)}/>
        </label>

        <label>
          Account:
          {this.renderAccounts()}
        </label>

        <button type='submit' disabled={disabled}>Publish Repository</button>
      </form>
    )
  }
}

function userToAPIUser(user: User): IAPIUser {
  return {
    login: user.login,
    avatarUrl: user.avatarURL,
    type: 'user',
    id: -1,
    url: '',
  }
}
