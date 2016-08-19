import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import User from '../../models/user'

interface IPublishRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly users: ReadonlyArray<User>
}

interface IPublishRepositoryState {
  readonly name: string
  readonly description: string
  readonly private: boolean
}

export default class PublishRepository extends React.Component<IPublishRepositoryProps, IPublishRepositoryState> {
  public constructor(props: IPublishRepositoryProps) {
    super(props)

    this.state = {
      name: props.repository.name,
      description: '',
      private: true,
    }
  }

  private onNameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      name: event.target.value,
      description: this.state.description,
      private: this.state.private,
    })
  }

  private onDescriptionChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      name: this.state.name,
      description: event.target.value,
      private: this.state.private,
    })
  }

  private onPrivateChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      name: this.state.name,
      description: this.state.description,
      private: event.target.checked,
    })
  }

  private publishRepository(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    this.props.dispatcher.closePopup()
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
          <select>
            {this.props.users.map(u => <option value={u.login} key={u.login}>{u.login}</option>)}
          </select>
        </label>

        <button type='submit' disabled={disabled}>Publish Repository</button>
      </form>
    )
  }
}
