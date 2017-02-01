import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { TabBar } from '../tab-bar'
import { AddExistingRepository } from './add-existing-repository'
import { CreateRepository } from './create-repository'
import { CloneRepository } from './clone-repository'
import { assertNever } from '../../lib/fatal-error'
import { User } from '../../models/user'

interface IAddRepositoryProps {
  readonly dispatcher: Dispatcher

  /** The logged in users. */
  readonly users: ReadonlyArray<User>
}

interface IAddRepositoryState {
  readonly selectedTab: AddRepositoryTab
}

enum AddRepositoryTab {
  AddExisting = 0,
  Create,
  Clone
}

/**
 * The component for adding a local repository, creating a new repository, or
 * cloning an existing repository.
 */
export class AddRepository extends React.Component<IAddRepositoryProps, IAddRepositoryState> {
  public constructor(props: IAddRepositoryProps) {
    super(props)

    this.state = { selectedTab: AddRepositoryTab.AddExisting }
  }

  private onTabClicked = (tab: AddRepositoryTab) => {
    this.setState({ selectedTab: tab })
  }

  public renderSelectedTab() {
    switch (this.state.selectedTab) {
      case AddRepositoryTab.AddExisting:
        return <AddExistingRepository dispatcher={this.props.dispatcher}/>

      case AddRepositoryTab.Create:
        return <CreateRepository dispatcher={this.props.dispatcher}/>

      case AddRepositoryTab.Clone:
        return <CloneRepository users={this.props.users} dispatcher={this.props.dispatcher}/>

      default:
        return assertNever(this.state.selectedTab, `Unknown tab: ${this.state.selectedTab}`)
    }
  }

  public render() {
    return (
      <div id='add-repository'>
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedTab}>
          <span role='button'>Add</span>
          <span role='button'>Create</span>
          <span role='button'>Clone</span>
        </TabBar>

        <div className='content'>
          {this.renderSelectedTab()}
        </div>
      </div>
    )
  }
}
