import * as React from 'react'

import List from './list'
import Repository from '../models/repository'
import {Octicon, OcticonSymbol} from './octicons'

interface ReposListProps {
  readonly selectedRow: number
  readonly onSelectionChanged: (row: number) => void
  readonly loading: boolean
  readonly repos: ReadonlyArray<Repository>
}

const RowHeight = 40

export default class ReposList extends React.Component<ReposListProps, void> {
  private renderRow(row: number): JSX.Element {
    const repo = this.props.repos[row]
    const symbol = this.iconForRepo(repo)
    const repoPath = repo.path
    const gitHubRepo = repo.gitHubRepository
    const tooltip = gitHubRepo
      ? gitHubRepo.fullName + '\n' + gitHubRepo.htmlURL + '\n' + repoPath
      : repoPath

    return (
      <div className='repository-list-item' key={row.toString()} title={tooltip}>
        <Octicon symbol={symbol} />
        <div className='name'>{repo.name}</div>
      </div>
    )
  }

  private iconForRepo(repo: Repository): OcticonSymbol {
    const gitHubRepo = repo.gitHubRepository
    if (!gitHubRepo) { return OcticonSymbol.repo }

    if (gitHubRepo.private) { return OcticonSymbol.lock }
    if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

    return OcticonSymbol.repo
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
