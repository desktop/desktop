import * as React from 'react'
import Repository from '../../models/repository'
import {Commit, LocalGitOperations} from '../../lib/local-git-operations'
import {default as CommitView} from './commit'
import List from '../list'

interface ICommitListProps {
  repository: Repository
}

interface ICommitListState {
  commits: Commit[]
}

export default class CommitList extends React.Component<ICommitListProps, ICommitListState> {
  public constructor(props: ICommitListProps) {
    super(props)

    this.state = {
      commits: [],
    }
  }

  public async componentDidMount() {
    const commits = await LocalGitOperations.getHistory(this.props.repository)
    this.setState(Object.assign({}, this.state, {commits}))
  }

  private renderCommit(row: number) {
    const commit = this.state.commits[row]
    return <CommitView commit={commit} key={commit.getSHA()}/>
  }

  private selectionChanged(row: number) {
    this.setState(Object.assign({}, this.state, {selectedRow: row}))
  }

  public render() {
    return (
      <div id='commit-list'>
        <List itemCount={this.state.commits.length}
              itemHeight={44}
              selectedRow={-1}
              renderItem={row => this.renderCommit(row)}
              onSelectionChanged={row => this.selectionChanged}/>
      </div>
    )
  }
}
