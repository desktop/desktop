import * as React from 'react'
import { TabBar } from '../tab-bar'
import { SignIn as SignInCore } from '../lib/sign-in'
import { fatalError } from '../../lib/fatal-error'
import { Dispatcher, SignInState } from '../../lib/dispatcher'

interface ISignInProps {
  readonly dispatcher: Dispatcher
  readonly signInState: SignInState | null
}

enum SignInTab {
  DotCom = 0,
  Enterprise,
}

interface ISignInState {
  readonly selectedIndex: SignInTab
}

/**
 * The tabbed Sign In component used to ask the user to sign in before
 * publishing.
 */
export class SignIn extends React.Component<ISignInProps, ISignInState> {
  public constructor(props: ISignInProps) {
    super(props)

    this.state = { selectedIndex: SignInTab.DotCom }
  }

  public componentWillMount() {
    this.props.dispatcher.beginDotComSignIn()
  }

  public render() {
    return (
      <div>
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedIndex}>
          <span>GitHub</span>
          <span>Enterprise</span>
        </TabBar>

        <div>
          {this.renderActiveTab()}
        </div>
      </div>
    )
  }

  private renderActiveTab() {

    const signInState = this.props.signInState

    if (!signInState) {
      return null
    }

    return (
      <SignInCore
        signInState={signInState}
        dispatcher={this.props.dispatcher}
      />
    )
  }

  private onTabClicked = (index: number) => {

    if (index === SignInTab.DotCom) {
      this.props.dispatcher.beginDotComSignIn()
    } else if (index === SignInTab.Enterprise) {
      this.props.dispatcher.beginEnterpriseSignIn()
    } else {
      return fatalError(`Unsupported tab index ${index}`)
    }

    this.setState({ selectedIndex: index })
  }
}
