import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'
import { LocalGitOperations, Commit } from '../../lib/local-git-operations'
import { CommitListItem } from '../history/commit-list-item'
import { User } from '../../models/user'

interface IConfigureGitProps {
  readonly dispatcher: Dispatcher
  readonly users: ReadonlyArray<User>
  readonly advance: (step: WelcomeStep) => void
  readonly cancel: () => void
}

interface IConfigureGitState {
  readonly name: string
  readonly email: string
  readonly avatarURL: string | null
}

export class ConfigureGit extends React.Component<IConfigureGitProps, IConfigureGitState> {
  public constructor(props: IConfigureGitProps) {
    super(props)

    this.state = { name: '', email: '', avatarURL: null }
  }

  public async componentWillMount() {
    const name = await LocalGitOperations.getGlobalConfigValue('user.name')
    const email = await LocalGitOperations.getGlobalConfigValue('user.email')
    const avatarURL = email ? this.avatarURLForEmail(email) : null
    this.setState({ name: name || '', email: email || '', avatarURL })
  }

  private dateWithMinuteOffset(date: Date, minuteOffset: number): Date {
    const copy = new Date(date.getTime())
    copy.setTime(copy.getTime() + (minuteOffset * 60 * 1000))
    return copy
  }

  public render() {
    const now = new Date()
    const dummyCommit1 = new Commit('', 'Do more things', '', 'Hubot', this.state.email, this.dateWithMinuteOffset(now, -2), [])
    const dummyCommit3 = new Commit('', 'Add some things', '', 'Hubot', this.state.email, this.dateWithMinuteOffset(now, -60), [])

    // NB: We're using the name as the commit SHA:
    //  1. `Commit` is referentially transparent wrt the SHA. So in order to get
    //     it to update when we name changes, we need to change the SHA.
    //  2. We don't display the SHA so the user won't ever know our secret.
    const dummyCommit2 = new Commit(this.state.name, 'Fix all the things', '', this.state.name, this.state.email, this.dateWithMinuteOffset(now, -30), [])
    const emoji = new Map()
    return (
      <div id='configure-git'>
        <h1>Configure Git</h1>
        <div className='description'>This is used to identify the commits you create. Anyone will be able to see this information if you publish commits.</div>

        <form onSubmit={e => this.continue(e)}>
          <label>
            Name
            <input placeholder='Hubot' value={this.state.name} onChange={e => this.onNameChange(e)}/>
          </label>

          <label>
            Email
            <input placeholder='hubot@github.com' value={this.state.email} onChange={e => this.onEmailChange(e)}/>
          </label>

          <div className='actions'>
            <button type='submit'>Continue</button>
            <button onClick={e => this.cancel(e)}>Cancel</button>
          </div>
        </form>

        <div id='commit-list'>
          <CommitListItem commit={dummyCommit1} emoji={emoji} avatarURL={null}/>
          <CommitListItem commit={dummyCommit2} emoji={emoji} avatarURL={this.state.avatarURL}/>
          <CommitListItem commit={dummyCommit3} emoji={emoji} avatarURL={null}/>
        </div>
      </div>
    )
  }

  private onNameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      name: event.currentTarget.value,
      email: this.state.email,
      avatarURL: this.state.avatarURL,
    })
  }

  private onEmailChange(event: React.FormEvent<HTMLInputElement>) {
    const email = event.currentTarget.value
    const avatarURL = this.avatarURLForEmail(email)

    this.setState({
      name: this.state.name,
      email,
      avatarURL,
    })
  }

  private avatarURLForEmail(email: string): string | null {
    const matchingUser = this.props.users.find(u => u.emails.indexOf(email) > -1)
    return matchingUser ? matchingUser.avatarURL : null
  }

  private async continue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    this.props.cancel()

    const name = this.state.name
    if (name.length) {
      await LocalGitOperations.setGlobalConfigValue('user.name', name)
    }

    const email = this.state.email
    if (email.length) {
      await LocalGitOperations.setGlobalConfigValue('user.email', email)
    }
  }

  private cancel(event: React.FormEvent<HTMLButtonElement>) {
    event.preventDefault()

    this.props.cancel()
  }
}
