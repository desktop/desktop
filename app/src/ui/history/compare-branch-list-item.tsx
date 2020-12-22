import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { Branch, IAheadBehind } from '../../models/branch'
import { IMatches } from '../../lib/fuzzy-find'
import { AheadBehindStore } from '../../lib/stores/ahead-behind-store'
import { Repository } from '../../models/repository'
import { IDisposable } from 'event-kit'

interface ICompareBranchListItemProps {
  readonly branch: Branch
  readonly currentBranch: Branch | null
  readonly repository: Repository

  /** The characters in the branch name to highlight */
  readonly matches: IMatches

  readonly aheadBehindStore: AheadBehindStore
}

interface ICompareBranchListItemState {
  readonly comparisonFrom?: string
  readonly comparisonTo?: string
  readonly aheadBehind?: IAheadBehind
}

export class CompareBranchListItem extends React.Component<
  ICompareBranchListItemProps,
  ICompareBranchListItemState
> {
  public static getDerivedStateFromProps(
    props: ICompareBranchListItemProps,
    state: ICompareBranchListItemState
  ): Partial<ICompareBranchListItemState> | null {
    const { repository, aheadBehindStore } = props
    const from = props.currentBranch?.tip.sha
    const to = props.branch.tip.sha

    if (from === state.comparisonFrom && to === state.comparisonTo) {
      return null
    }

    if (from === undefined || to === undefined) {
      return { aheadBehind: undefined, comparisonFrom: from, comparisonTo: to }
    }

    const aheadBehind = aheadBehindStore.tryGetAheadBehind(repository, from, to)
    return { aheadBehind, comparisonFrom: from, comparisonTo: to }
  }

  private aheadBehindSubscription: IDisposable | null = null

  public constructor(props: ICompareBranchListItemProps) {
    super(props)
    this.state = {}
  }

  public componentDidMount() {
    // If we failed to get a value synchronously in getDerivedStateFromProps
    // we'll load one asynchronously now, otherwise we'll wait until the next
    // prop update to see if the comparison revs change.
    if (this.state.aheadBehind === undefined) {
      this.subscribeToAheadBehindStore()
    }
  }

  public componentDidUpdate(
    prevProps: ICompareBranchListItemProps,
    prevState: ICompareBranchListItemState
  ) {
    const { comparisonFrom: from, comparisonTo: to } = this.state

    if (prevState.comparisonFrom !== from || prevState.comparisonTo !== to) {
      this.subscribeToAheadBehindStore()
    }
  }

  public componentWillUnmount() {
    this.unsubscribeFromAheadBehindStore()
  }

  private subscribeToAheadBehindStore() {
    const { aheadBehindStore, repository } = this.props
    const { comparisonFrom: from, comparisonTo: to, aheadBehind } = this.state

    this.unsubscribeFromAheadBehindStore()

    if (from !== undefined && to !== undefined && aheadBehind === undefined) {
      this.aheadBehindSubscription = aheadBehindStore.getAheadBehind(
        repository,
        from,
        to,
        aheadBehind => this.setState({ aheadBehind })
      )
    }
  }

  private unsubscribeFromAheadBehindStore() {
    if (this.aheadBehindSubscription !== null) {
      this.aheadBehindSubscription.dispose()
    }
  }

  public render() {
    const { currentBranch, branch } = this.props
    const { aheadBehind } = this.state
    const isCurrentBranch = branch.name === currentBranch?.name
    const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch

    const aheadBehindElement = aheadBehind ? (
      <div className="branch-commit-counter">
        <span className="branch-commit-counter-item">
          {aheadBehind.behind}
          <Octicon className="icon" symbol={OcticonSymbol.arrowDown} />
        </span>

        <span className="branch-commit-counter-item">
          {aheadBehind.ahead}
          <Octicon className="icon" symbol={OcticonSymbol.arrowUp} />
        </span>
      </div>
    ) : null

    return (
      <div className="branches-list-item">
        <Octicon className="icon" symbol={icon} />
        <div className="name" title={branch.name}>
          <HighlightText
            text={branch.name}
            highlight={this.props.matches.title}
          />
        </div>
        {aheadBehindElement}
      </div>
    )
  }
}
