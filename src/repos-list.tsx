import * as React from 'react'

import List from './list'
import Repository from './models/repository'
import {Octicon, OcticonSymbol} from './ui/octicons'

interface ReposListProps {
  selectedRow: number
  onSelectionChanged: (row: number) => void
  loading: boolean
  repos: Repository[]
}

const RowHeight = 40

export default class ReposList extends React.Component<ReposListProps, void> {
  private renderRow(row: number): JSX.Element {
    const repo = this.props.repos[row]
    const symbol = this.iconForRepo(repo)

    return (
      <div className='repository-list-item' key={row.toString()} title={repo.getName()}>
        <Octicon symbol={symbol} />
        <div className='name'>{repo.getName()}</div>
      </div>
    )
  }

  private iconForRepo(repo: Repository): OcticonSymbol {

    return OcticonSymbol.repo

    /* TODO
    if (repo.private) { return OcticonSymbol.lock }
    if (repo.fork) { return OcticonSymbol.repoForked }

    return OcticonSymbol.repo
    */
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
      <List id='repository-list'
            itemCount={this.props.repos.length}
            itemHeight={RowHeight}
            renderItem={row => this.renderRow(row)}
            selectedRow={this.props.selectedRow}
            onSelectionChanged={row => this.props.onSelectionChanged(row)} />
    )
  }
}
