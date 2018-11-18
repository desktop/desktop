import * as React from 'react'

import { UiView } from './ui-view'
import { Dispatcher } from '../lib/dispatcher'
import { Repository } from '../models/repository'

import { Button } from './lib/button'
import { Row } from './lib/row'
import { isGitRepository } from '../lib/git'

interface IMissingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

// The maximum value that can be used in setInterval or
// setTimeout without it overflowing (2 ^ 31 - 1). See
//  http://stackoverflow.com/a/16314807
const MAX_INTERVAL = 2147483647

const recoveryDelayLong = 10000
const recoveryDelayShort = 1000

/** The view displayed when a repository is missing. */
export class MissingRepository extends React.Component<
  IMissingRepositoryProps,
  {}
> {
  private timer: number | null = null

  private clearTimer() {
    if (this.timer) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  public render() {
    const buttons = new Array<JSX.Element>()
    buttons.push(
      <Button key="locate" onClick={this.locate} type="submit">
        Locate…
      </Button>
    )

    if (this.canCloneAgain()) {
      buttons.push(
        <Button key="clone-again" onClick={this.cloneAgain}>
          Clone Again
        </Button>
      )
    }

    buttons.push(
      <Button key="remove" onClick={this.remove}>
        Remove
      </Button>
    )

    this.awaitAutoRecovery(recoveryDelayShort) // attempt auto recovery, or set timer to try again later

    return (
      <UiView id="missing-repository-view">
        <div className="title-container">
          <div className="title">Can't find "{this.props.repository.name}"</div>
          <div className="details">
            It was last seen at{' '}
            <span className="path">{this.props.repository.path}</span>
          </div>
        </div>

        <Row>{buttons}</Row>
      </UiView>
    )
  }

  private canCloneAgain() {
    const gitHubRepository = this.props.repository.gitHubRepository
    return gitHubRepository && gitHubRepository.cloneURL
  }

  private remove = () => {
    this.clearTimer()
    this.props.dispatcher.removeRepositories([this.props.repository], false)
  }

  private locate = () => {
    this.clearTimer()
    this.props.dispatcher.relocateRepository(this.props.repository)
  }

  private cloneAgain = async () => {
    const gitHubRepository = this.props.repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    const cloneURL = gitHubRepository.cloneURL
    if (!cloneURL) {
      return
    }

    this.clearTimer()
    try {
      await this.props.dispatcher.cloneAgain(
        cloneURL,
        this.props.repository.path
      )
    } catch (error) {
      this.props.dispatcher.postError(error)
    }
  }

  private awaitAutoRecovery(timeout: number) {
    // set a timeout to wait to attempt an auto recovery
    this.clearTimer()
    this.timer = window.setTimeout(
      this.attemptAutoRecovery,
      Math.min(timeout, MAX_INTERVAL)
    )
  }

  private readonly attemptAutoRecovery = () => {
    this.AutoRecovery()
  }

  public componentWillUnmount() {
    this.clearTimer()
  }

  private async AutoRecovery() {
    if (this.timer && this.props.repository.missing) {
      // do attempt to recover the missing repository, unless timer has been cleared
      // if not, set timeout to try again

      if (await isGitRepository(this.props.repository.path)) {
        // a git repository was found on the original path
        if (
          (await this.props.dispatcher.updateRepositoryMissing(
            this.props.repository,
            false
          )).missing
        ) {
          this.awaitAutoRecovery(recoveryDelayLong)
        } else {
          this.clearTimer() // repository is no longer missing
        }
      } else {
        this.awaitAutoRecovery(recoveryDelayLong)
      }
    } else if (this.timer) {
      this.clearTimer() // clear timer as repository is not marked missing ??
    }
  }
}
