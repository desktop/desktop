import * as React from 'react'
import { IMatches } from '../../lib/fuzzy-find'
import { Branch } from '../../models/branch'
import { Button } from '../lib/button'
import { ClickSource } from '../lib/list'
import { Popover } from '../lib/popover'
import { Ref } from '../lib/ref'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { BranchList } from './branch-list'
import { renderDefaultBranch } from './branch-renderer'
import { IBranchListItem } from './group-branches'

const defaultDropdownListHeight = 300
const maxDropdownListHeight = 500

interface IBranchSelectProps {
  /** The initially selected branch. */
  readonly branch: Branch

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch
   */
  readonly currentBranch: Branch

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /** Called when the user changes the selected branch. */
  readonly onChange?: (branch: Branch) => void
}

interface IBranchSelectState {
  readonly showBranchDropdown: boolean
  readonly selectedBranch: Branch | null
  readonly filterText: string
  readonly dropdownListHeight: number
}

/**
 * A branch select element for filter and selecting a branch.
 */
export class BranchSelect extends React.Component<
  IBranchSelectProps,
  IBranchSelectState
> {
  private invokeButtonRef: HTMLButtonElement | null = null

  public constructor(props: IBranchSelectProps) {
    super(props)

    this.state = {
      showBranchDropdown: false,
      selectedBranch: props.branch,
      filterText: '',
      dropdownListHeight: defaultDropdownListHeight,
    }
  }

  public componentDidMount() {
    this.calculateDropdownListHeight()
  }

  public componentDidUpdate() {
    this.calculateDropdownListHeight()
  }

  private calculateDropdownListHeight = () => {
    if (this.invokeButtonRef === null) {
      return
    }

    const windowHeight = window.innerHeight
    const bottomOfButton = this.invokeButtonRef.getBoundingClientRect().bottom
    const listHeaderHeight = 75
    const calcMaxHeight = Math.round(
      windowHeight - bottomOfButton - listHeaderHeight
    )

    const dropdownListHeight =
      calcMaxHeight > maxDropdownListHeight
        ? maxDropdownListHeight
        : calcMaxHeight
    if (dropdownListHeight !== this.state.dropdownListHeight) {
      this.setState({ dropdownListHeight })
    }
  }

  private onInvokeButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.invokeButtonRef = buttonRef
  }

  private toggleBranchDropdown = () => {
    this.setState({ showBranchDropdown: !this.state.showBranchDropdown })
  }

  private closeBranchDropdown = () => {
    this.setState({ showBranchDropdown: false })
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  private onItemClick = (branch: Branch, source: ClickSource) => {
    source.event.preventDefault()
    this.setState({ showBranchDropdown: false, selectedBranch: branch })
    this.props.onChange?.(branch)
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  public renderBranchDropdown() {
    if (!this.state.showBranchDropdown) {
      return
    }

    const { currentBranch, defaultBranch, recentBranches, allBranches } =
      this.props

    const { filterText, selectedBranch, dropdownListHeight } = this.state

    return (
      <Popover
        className="branch-select-dropdown"
        onClickOutside={this.closeBranchDropdown}
      >
        <div className="branch-select-dropdown-header">
          Choose a base branch
          <button
            className="close"
            onClick={this.closeBranchDropdown}
            aria-label="close"
          >
            <Octicon symbol={OcticonSymbol.x} />
          </button>
        </div>
        <div
          className="branch-select-dropdown-list"
          style={{ height: `${dropdownListHeight}px` }}
        >
          <BranchList
            allBranches={allBranches}
            currentBranch={currentBranch}
            defaultBranch={defaultBranch}
            recentBranches={recentBranches}
            filterText={filterText}
            onFilterTextChanged={this.onFilterTextChanged}
            selectedBranch={selectedBranch}
            canCreateNewBranch={false}
            renderBranch={this.renderBranch}
            onItemClick={this.onItemClick}
          />
        </div>
      </Popover>
    )
  }

  public render() {
    return (
      <div className="branch-select-component">
        <Button
          onClick={this.toggleBranchDropdown}
          onButtonRef={this.onInvokeButtonRef}
        >
          <Ref>
            <span className="base-label">base:</span>
            {this.state.selectedBranch?.name}
            <Octicon symbol={OcticonSymbol.triangleDown} />
          </Ref>
        </Button>
        {this.renderBranchDropdown()}
      </div>
    )
  }
}
