import * as React from 'react'
import { User } from '../../models/user'
import { Dispatcher } from '../../lib/dispatcher'
import { TabBar } from '../tab-bar'
import { Accounts } from './accounts'
import { Git } from './git'
import { assertNever } from '../../lib/fatal-error'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComUser: User | null
  readonly enterpriseUser: User | null
}

enum PreferencesTab {
  Accounts = 0,
  Git
}

interface IPreferencesState {
  readonly selectedIndex: PreferencesTab
}

/** The app-level preferences component. */
export class Preferences extends React.Component<IPreferencesProps, IPreferencesState> {
  public constructor(props: IPreferencesProps) {
    super(props)

    this.state = { selectedIndex: PreferencesTab.Accounts }
  }

  public render() {
    return (
      <div id='preferences'>
        <h1>PREFERENCES!!!!!!!</h1>
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedIndex}>
          <span>Accounts</span>
          <span>Git</span>
        </TabBar>

        {this.renderActiveTab()}
      </div>
    )
  }

  private renderActiveTab() {
    const index = this.state.selectedIndex
    switch (index) {
      case PreferencesTab.Accounts: return <Accounts {...this.props}/>
      case PreferencesTab.Git: return <Git/>
      default: return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }
}
