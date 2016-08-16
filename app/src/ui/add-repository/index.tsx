import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import TabBar from '../tab-bar'
import AddExistingRepository from './add-existing-repository'
import CreateRepository from './create-repository'
import CloneRepository from './clone-repository'
import fatalError from '../../lib/fatal-error'

interface IAddRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface IAddRepositoryState {
  readonly selectedTab: AddRepositoryTab
}

enum AddRepositoryTab {
  AddExisting = 0,
  Create,
  Clone
}

export default class AddRepository extends React.Component<IAddRepositoryProps, IAddRepositoryState> {
  public constructor(props: IAddRepositoryProps) {
    super(props)

    this.state = { selectedTab: AddRepositoryTab.AddExisting }
  }

  private onTabClicked(tab: AddRepositoryTab) {
    this.setState({ selectedTab: tab })
  }

  public renderSelectedTab() {
    switch (this.state.selectedTab) {
      case AddRepositoryTab.AddExisting:
        return <AddExistingRepository dispatcher={this.props.dispatcher}/>

      case AddRepositoryTab.Create:
        return <CreateRepository dispatcher={this.props.dispatcher}/>

      case AddRepositoryTab.Clone:
        return <CloneRepository dispatcher={this.props.dispatcher}/>

      default:
        return fatalError(`Unknown tab: ${this.state.selectedTab}`)
    }
  }

  public render() {
    return (
      <div>
        <TabBar onTabClicked={index => this.onTabClicked(index)} selectedIndex={this.state.selectedTab}>
          <span>Add</span>
          <span>Create</span>
          <span>Clone</span>
        </TabBar>

        {this.renderSelectedTab()}
      </div>
    )
  }
}
