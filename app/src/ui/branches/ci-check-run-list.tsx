import * as React from 'react'
import { GitHubRepository } from '../../models/github-repository'
import { IDisposable } from 'event-kit'
import { Dispatcher } from '../dispatcher'
import {
  ICombinedRefCheck,
  IRefCheck,
} from '../../lib/stores/commit-status-store'
import { List } from '../lib/list'
import { Octicon, syncClockwise } from '../octicons'
import _ from 'lodash'
import { Button } from '../lib/button'
import { CICheckRunListItem } from './ci-check-list-item'

const RowHeight = 50

interface ICICheckRunListProps {
  /** The classname for the underlying element. */
  readonly className?: string

  readonly dispatcher: Dispatcher

  /** The GitHub repository to use when looking up commit status. */
  readonly repository: GitHubRepository

  /** The pull request's number. */
  readonly prNumber: number
}

interface ICICheckRunListState {
  readonly check: ICombinedRefCheck | null
}

/** The CI Check list. */
export class CICheckRunList extends React.PureComponent<
  ICICheckRunListProps,
  ICICheckRunListState
> {
  private statusSubscription: IDisposable | null = null

  public constructor(props: ICICheckRunListProps) {
    super(props)
    this.state = {
      check: props.dispatcher.tryGetCommitStatus(
        this.props.repository,
        this.getCommitRef(this.props.prNumber)
      ),
    }
  }

  private getCommitRef(prNumber: number): string {
    return `refs/pull/${prNumber}/head`
  }

  private subscribe() {
    this.unsubscribe()

    this.statusSubscription = this.props.dispatcher.subscribeToCommitStatus(
      this.props.repository,
      this.getCommitRef(this.props.prNumber),
      this.onStatus
    )
  }

  private unsubscribe() {
    if (this.statusSubscription) {
      this.statusSubscription.dispose()
      this.statusSubscription = null
    }
  }

  public componentDidUpdate(prevProps: ICICheckRunListProps) {
    // Re-subscribe if we're being reused to show a different status.
    if (
      this.props.repository !== prevProps.repository ||
      this.getCommitRef(this.props.prNumber) !==
        this.getCommitRef(prevProps.prNumber)
    ) {
      this.setState({
        check: this.props.dispatcher.tryGetCommitStatus(
          this.props.repository,
          this.getCommitRef(this.props.prNumber)
        ),
      })
      this.subscribe()
    }
  }

  public componentDidMount() {
    this.subscribe()
  }

  public componentWillUnmount() {
    this.unsubscribe()
  }

  private onStatus = (check: ICombinedRefCheck | null) => {
    this.setState({ check })
  }

  private renderRow = (checks: ReadonlyArray<IRefCheck>) => {
    return (row: number): JSX.Element | null => {
      return <CICheckRunListItem checkRun={checks[row]} />
    }
  }

  private rerunJobs = () => {
    // TODO: Rerun jobs
  }

  private getListHeightStyles = (
    checks: ReadonlyArray<IRefCheck>
  ): React.CSSProperties => {
    return { height: checks.length * RowHeight, maxHeight: '100%' }
  }

  private renderList = (checks: ReadonlyArray<IRefCheck>) => {
    const styles = this.getListHeightStyles(checks)
    return (
      <div className="ci-check-list" style={styles}>
        <List
          rowCount={checks.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderRow(checks)}
          selectedRows={[]}
        />
      </div>
    )
  }

  public renderRerunButton = () => {
    return (
      <div className="ci-check-rerun">
        <Button onClick={this.rerunJobs}>
          <Octicon symbol={syncClockwise} /> Re-run jobs
        </Button>
      </div>
    )
  }

  public render() {
    const { check } = this.state

    if (check === null || check.checks.length === 0) {
      return null
    }

    const checksByApp = _.groupBy(check.checks, 'appName')
    const appNames = Object.keys(checksByApp).sort(
      (a, b) => b.length - a.length
    )

    const checkLists = appNames.map((appName: string, index: number) => {
      return (
        <div className="ci-check-app-list" key={appName}>
          <div className="ci-check-app-header">
            <div className="ci-check-app-name">
              {appName !== '' ? appName : 'Other'}
            </div>
            {index === 0 ? this.renderRerunButton() : null}
          </div>
          {this.renderList(checksByApp[appName])}
        </div>
      )
    })

    return <>{checkLists}</>
  }
}
