import * as React from 'react'
import { TabBar } from '../tab-bar'
import { SignIn } from '../lib/sign-in'
import { assertNever } from '../../lib/fatal-error'
import { Dispatcher } from '../../lib/dispatcher'
import { getDotComAPIEndpoint } from '../../lib/api'
import { User } from '../../models/user'

interface ILogInProps {
  readonly dispatcher: Dispatcher

  readonly onSignIn: () => void
}

enum LogInTab {
  DotCom = 0,
  Enterprise,
}

interface ILogInState {
  readonly selectedIndex: LogInTab
}

export class LogIn extends React.Component<ILogInProps, ILogInState> {
  public constructor(props: ILogInProps) {
    super(props)

    this.state = { selectedIndex: LogInTab.DotCom }
  }

  public render() {
    return (
      <div>
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedIndex}>
          <span>GitHub</span>
          <span>Enterprise</span>
        </TabBar>

        <div className='publish-repository'>
          {this.renderActiveTab()}
        </div>
      </div>
    )
  }

  private renderActiveTab() {
    const index = this.state.selectedIndex
    switch (index) {
      case LogInTab.DotCom: {
        return <SignIn
          endpoint={getDotComAPIEndpoint()}
          onDidSignIn={this.onDidSignIn}/>
      }
      case LogInTab.Enterprise: {
        return <SignIn onDidSignIn={this.onDidSignIn}/>
      }
      default: return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }

  private onDidSignIn = async (user: User) => {
    await this.props.dispatcher.addUser(user)

    this.props.onSignIn()
  }
}
