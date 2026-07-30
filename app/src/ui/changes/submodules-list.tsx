// Created by Pablo Urena Simon.

import * as Path from 'path'
import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Repository } from '../../models/repository'
import {
  SubmoduleEntry,
  SubmoduleWorkingTreeState,
} from '../../models/submodule'
import { WorkingDirectoryStatus } from '../../models/status'

interface ISubmodulesListProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly submodules: ReadonlyArray<SubmoduleEntry>
  readonly workingDirectory: WorkingDirectoryStatus
  readonly filterText: string
  readonly onOpenSubmodule: (fullPath: string) => void
}

export class SubmodulesList extends React.Component<ISubmodulesListProps> {
  private getFilteredSubmodules() {
    const filter = this.props.filterText.toLowerCase()

    if (filter.length === 0) {
      return this.props.submodules
    }

    return this.props.submodules.filter(submodule =>
      [submodule.path, submodule.sha, submodule.describe]
        .filter(value => value.length > 0)
        .some(value => value.toLowerCase().includes(filter))
    )
  }

  private getChangeSummary(submodule: SubmoduleEntry) {
    if (
      submodule.workingTreeState === SubmoduleWorkingTreeState.Uninitialized
    ) {
      return 'Not initialized'
    }

    if (submodule.workingTreeState === SubmoduleWorkingTreeState.Conflicted) {
      return 'Conflicted'
    }

    const changedSubmodule = this.props.workingDirectory.files.find(
      file =>
        file.path === submodule.path &&
        file.status.submoduleStatus !== undefined
    )
    const status = changedSubmodule?.status.submoduleStatus

    if (status === undefined) {
      return submodule.workingTreeState ===
        SubmoduleWorkingTreeState.CommitChanged
        ? 'Commit'
        : 'Clean'
    }

    const changes = new Array<string>()

    if (status.commitChanged) {
      changes.push('Commit')
    }
    if (status.modifiedChanges) {
      changes.push('Modified')
    }
    if (status.untrackedChanges) {
      changes.push('Untracked')
    }

    return changes.length > 0 ? changes.join(', ') : 'Changed'
  }

  private onOpenSubmodule = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const submodulePath = event.currentTarget.value
    const submodule = this.props.submodules.find(
      candidate => candidate.path === submodulePath
    )

    if (submodule === undefined) {
      return
    }

    if (
      submodule.workingTreeState === SubmoduleWorkingTreeState.Uninitialized &&
      !(await this.props.dispatcher.initializeSubmodule(
        this.props.repository,
        submodule.path
      ))
    ) {
      return
    }

    this.props.onOpenSubmodule(
      Path.join(this.props.repository.path, submodule.path)
    )
  }

  public render() {
    const submodules = this.getFilteredSubmodules()

    if (this.props.submodules.length === 0) {
      return (
        <div className="submodules-list-empty">
          This repository does not have submodules.
        </div>
      )
    }

    if (submodules.length === 0) {
      return (
        <div className="submodules-list-empty">
          No submodules match the current filter.
        </div>
      )
    }

    return (
      <div className="submodules-list-view" role="list">
        {submodules.map(submodule => {
          const shortSha = submodule.sha.substring(0, 7)
          const detail =
            submodule.describe.length > 0
              ? `${shortSha} · ${submodule.describe}`
              : shortSha
          const summary = this.getChangeSummary(submodule)

          return (
            <div key={submodule.path} role="listitem">
              <button
                type="button"
                value={submodule.path}
                className="submodule-list-item"
                aria-label={`${submodule.path}, ${summary}`}
                onClick={this.onOpenSubmodule}
              >
                <Octicon
                  className="submodule-list-item-icon"
                  symbol={octicons.fileSubmodule}
                />
                <span className="submodule-list-item-content">
                  <span className="submodule-list-item-path">
                    {submodule.path}
                  </span>
                  <span className="submodule-list-item-detail">{detail}</span>
                </span>
                <span className="submodule-list-item-status">{summary}</span>
                <Octicon
                  className="submodule-list-item-open"
                  symbol={octicons.chevronRight}
                />
              </button>
            </div>
          )
        })}
      </div>
    )
  }
}
