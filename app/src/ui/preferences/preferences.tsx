import * as React from 'react'
import { User } from '../../models/user'
import { Dispatcher } from '../../lib/dispatcher'
import { TabBar } from '../tab-bar'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComUser: User | null
  readonly enterpriseUser: User | null
}

interface IPreferencesState {
  readonly selectedIndex: number
}

export class Preferences extends React.Component<IPreferencesProps, IPreferencesState> {
  public constructor(props: IPreferencesProps) {
    super(props)

    this.state = { selectedIndex: 0 }
  }

  public render() {
    return (
      <div>
        <h1>PREFERENCES!!!!!!!</h1>
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedIndex}>
          <span>Accounts</span>
          <span>Git</span>
        </TabBar>
      </div>
    )
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }
}
