import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'

interface IConfigureGitProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly cancel: () => void
}

export class ConfigureGit extends React.Component<IConfigureGitProps, void> {
  public render() {
    return (
      <div>
        <h1>Configure Git</h1>
        <div>This is used to identify the commits you create. Anyone will be able to see this information if you publish commits.</div>

        <label>
          Name
          <input/>
        </label>

        <label>
          Email
          <input/>
        </label>

        <div>
          <button onClick={() => this.continue()}>Continue</button>
          <button onClick={() => this.cancel()}>Cancel</button>
        </div>

        <div>PLACEHOLDER</div>
      </div>
    )
  }

  private continue() {
    // TODO: Actually set the git config

    this.props.cancel()
  }

  private cancel() {
    this.props.cancel()
  }
}
