import * as React from 'react'
import { TabBar } from '../tab-bar'
import { SignIn as SignInCore } from '../lib/sign-in'
import { assertNever } from '../../lib/fatal-error'
import { Dispatcher } from '../../lib/dispatcher'
import { getDotComAPIEndpoint } from '../../lib/api'
import { User } from '../../models/user'

interface ISignInProps {
  readonly dispatcher: Dispatcher
}

enum SignInTab {
  DotCom = 0,
  Enterprise,
}

interface ISignInState {
  readonly selectedIndex: SignInTab
}

export class SignIn extends React.Component<ISignInProps, ISignInState> {
  public constructor(props: ISignInProps) {
    super(props)

    this.state = { selectedIndex: SignInTab.DotCom }
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
      case SignInTab.DotCom: {
        return <SignInCore
          endpoint={getDotComAPIEndpoint()}
          onDidSignIn={this.onDidSignIn}/>
      }
      case SignInTab.Enterprise: {
        return <SignInCore onDidSignIn={this.onDidSignIn}/>
      }
      default: return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }

  private onDidSignIn = async (user: User) => {
    await this.props.dispatcher.addUser(user)
  }
}
