import * as React from 'react'
import Repository from '../../models/repository'
import { Octicon, OcticonSymbol } from '../octicons'

interface IRepositoryListItemProps {
  repository: Repository
}

/** A repository item. */
export default class RepositoryListItem extends React.Component<IRepositoryListItemProps, void> {
  public render() {
    const repository = this.props.repository
    const path = repository.path
    const gitHubRepo = repository.gitHubRepository
    const tooltip = gitHubRepo
      ? gitHubRepo.fullName + '\n' + gitHubRepo.htmlURL + '\n' + path
      : path

    return (
      <div className='repository-list-item pl-3' title={tooltip}>
        <Octicon symbol={iconForRepository(repository)} />
        <div className='name'>{repository.name}</div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps, nextState: void): boolean {
    return nextProps.repository.id !== this.props.repository.id
  }
}

function iconForRepository(repository: Repository): OcticonSymbol {
  const gitHubRepo = repository.gitHubRepository
  if (!gitHubRepo) { return OcticonSymbol.repo }

  if (gitHubRepo.private) { return OcticonSymbol.lock }
  if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

  return OcticonSymbol.repo
}
