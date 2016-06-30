import * as React from 'react'

import List from './list'
import User from './models/user'
import Repository from './models/repository'

interface ReposListProps {
  selectedRow: number,
  onSelectionChanged: (row: number) => void,
  user: User,
  loading: boolean,
  repos: Repository[]
}

const RowHeight = 44

export default class ReposList extends React.Component<ReposListProps, void> {
  private renderRow(row: number): JSX.Element {
    const selected = row === this.props.selectedRow
    const repo = this.props.repos[row]
    const rowStyle = {
      display: 'flex',
      flexDirection: 'column',
      padding: 4,
      backgroundColor: selected ? 'blue' : 'transparent',
      color: selected ? 'white' : 'black',
      height: RowHeight
    }

    const titleStyle = {
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      overflow: 'hidden'
    }

    return (
      <div style={rowStyle} key={row.toString()}>
        <div style={titleStyle} title={repo.getName()}>{repo.getName()}</div>
      </div>
    )
  }

  private renderLoading() {
    return (
      <div>Loading…</div>
    )
  }

  public render() {
    if (this.props.loading) {
      return this.renderLoading()
    }

    return (
      <List itemCount={this.props.repos.length}
            itemHeight={RowHeight}
            renderItem={row => this.renderRow(row)}
            selectedRow={this.props.selectedRow}
            onSelectionChanged={row => this.props.onSelectionChanged(row)}
            style={{width: 120}}/>
    )
  }
}
