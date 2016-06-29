import * as React from 'react'

import List from './list'
import User from './models/user'
import {Repo} from './lib/api'

interface ReposListProps {
  selectedRow: number,
  onSelectionChanged: (row: number) => void,
  user: User,
  loading: boolean,
  repos: Repo[]
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

    const whiteness = 140
    const ownerStyle = {
      fontSize: '0.8em',
      color: selected ? 'white' : `rgba(${whiteness}, ${whiteness}, ${whiteness}, 1)`
    }

    return (
      <div style={rowStyle} key={row.toString()}>
        <div style={titleStyle} title={repo.name}>{repo.name}</div>
        <div style={ownerStyle}>
          by {repo.owner.login} <img src={repo.owner.avatarUrl} style={{width: 12, height: 12, borderRadius: '50%'}}/>
        </div>
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
