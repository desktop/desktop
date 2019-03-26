import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { APIRefState, IAPIRefStatus } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'
import { getRefStatusSummary } from './pull-request-status'
import { GitHubRepository } from '../../models/github-repository'
import { IDisposable } from 'event-kit'
import { Dispatcher } from '../dispatcher'

interface ICIStatusProps {
  /** The classname for the underlying element. */
  readonly className?: string

  readonly dispatcher: Dispatcher

  /** The GitHub repository to use when looking up commit status. */
  readonly repository: GitHubRepository

  /** The commit ref (can be a SHA or a Git ref) for which to fetch status. */
  readonly commitRef: string
}

interface ICIStatusState {
  readonly status: IAPIRefStatus | null
}

/** The little CI status indicator. */
export class CIStatus extends React.PureComponent<
  ICIStatusProps,
  ICIStatusState
> {
  private statusSubscription: IDisposable | null = null

  public constructor(props: ICIStatusProps) {
    super(props)
    this.state = {
      status: props.dispatcher.tryGetCommitStatus(
        this.props.repository,
        this.props.commitRef
      ),
    }
  }

  private subscribe() {
    this.unsubscribe()

    this.statusSubscription = this.props.dispatcher.subscribeToCommitStatus(
      this.props.repository,
      this.props.commitRef,
      this.onStatus
    )
  }

  private unsubscribe() {
    if (this.statusSubscription) {
      this.statusSubscription.dispose()
    }
  }

  public componentDidUpdate(prevProps: ICIStatusProps) {
    // Re-subscribe if we're being reused to show a different status.
    if (
      this.props.repository !== prevProps.repository ||
      this.props.commitRef !== prevProps.commitRef
    ) {
      this.setState({
        status: this.props.dispatcher.tryGetCommitStatus(
          this.props.repository,
          this.props.commitRef
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

  private onStatus = (status: IAPIRefStatus | null) => {
    this.setState({ status })
  }

  public render() {
    const { status } = this.state

    if (status === null || status.total_count === 0) {
      return null
    }

    const title = getRefStatusSummary(status)
    const state = status.state

    return (
      <Octicon
        className={classNames(
          'ci-status',
          `ci-status-${state}`,
          this.props.className
        )}
        symbol={getSymbolForState(state)}
        title={title}
      />
    )
  }
}

function getSymbolForState(state: APIRefState): OcticonSymbol {
  switch (state) {
    case 'pending':
      return OcticonSymbol.primitiveDot
    case 'failure':
      return OcticonSymbol.x
    case 'success':
      return OcticonSymbol.check
  }

  return assertNever(state, `Unknown state: ${state}`)
}
