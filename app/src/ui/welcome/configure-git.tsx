import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'
import { LocalGitOperations } from '../../lib/local-git-operations'

interface IConfigureGitProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly cancel: () => void
}

interface IConfigureGitState {
  readonly name: string
  readonly email: string
}

export class ConfigureGit extends React.Component<IConfigureGitProps, IConfigureGitState> {
  public constructor(props: IConfigureGitProps) {
    super(props)

    this.state = { name: '', email: '' }
  }

  public async componentWillMount() {
    const name = await LocalGitOperations.getGlobalConfigValue('user.name')
    const email = await LocalGitOperations.getGlobalConfigValue('user.email')
    this.setState({ name: name || '', email: email || '' })
  }

  public render() {
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
            <button onClick={() => this.cancel()}>Cancel</button>
          </div>
        </form>

        <div>PLACEHOLDER</div>
      </div>
    )
  }

  private onNameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({ name: event.currentTarget.value, email: this.state.email })
  }

  private onEmailChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({ name: this.state.name, email: event.currentTarget.value })
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

  private cancel() {
    this.props.cancel()
  }
}
