import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import {
  countActiveFilterOptions,
  getItemCommitState,
  hasActiveFilters,
} from './filter-changes-logic'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IFileListFilterState } from '../../lib/app-state'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import memoizeOne from 'memoize-one'
import { Button } from '../lib/button'
import classNames from 'classnames'
import { IChangesListItem } from './filter-changes-list'
import { AppFileStatusKind } from '../../models/status'

interface IChangesListFilterOptionsProps {
  readonly fileListFilter: IFileListFilterState
  readonly filteredItems: Map<string, IChangesListItem>
  readonly onFilterToIncludedInCommit: () => void
  readonly onFilterExcludedFiles: () => void
  readonly onFilterDeletedFiles: () => void
  readonly onFilterModifiedFiles: () => void
  readonly onFilterNewFiles: () => void
  readonly onClearAllFilters: () => void
}

interface IChangesListFilterOptionsState {
  readonly isFilterOptionsOpen: boolean
}

/**
 * Component to render filter options for the changes list.
 *
 * Allows users to filter files based on their status (new, modified, deleted, etc.)
 * and includes a button to clear all filters.
 */
export class ChangesListFilterOptions extends React.Component<
  IChangesListFilterOptionsProps,
  IChangesListFilterOptionsState
> {
  private getFilterCounts = memoizeOne(
    (filteredItems: Map<string, IChangesListItem>) => {
      const counts = {
        newFilesCount: 0,
        modifiedFilesCount: 0,
        deletedFilesCount: 0,
        includedFilesCount: 0,
        excludedFilesCount: 0,
      }

      for (const item of filteredItems.values()) {
        const status = item.status ?? item.change.status
        if (
          status.kind === AppFileStatusKind.New ||
          status.kind === AppFileStatusKind.Untracked
        ) {
          counts.newFilesCount++
        }
        if (status.kind === AppFileStatusKind.Modified) {
          counts.modifiedFilesCount++
        }
        if (status.kind === AppFileStatusKind.Deleted) {
          counts.deletedFilesCount++
        }

        const { isIncludedInCommit, isExcludedFromCommit } =
          getItemCommitState(item)
        if (isIncludedInCommit) {
          counts.includedFilesCount++
        }

        if (isExcludedFromCommit) {
          counts.excludedFilesCount++
        }
      }

      return counts
    }
  )

  private filterOptionsButtonRef: HTMLButtonElement | null = null

  public constructor(props: IChangesListFilterOptionsProps) {
    super(props)

    this.state = {
      isFilterOptionsOpen: false,
    }
  }

  private closeFilterOptions = () => {
    this.setState({ isFilterOptionsOpen: false })
  }

  private onFilterToIncludedInCommit = () => {
    this.props.onFilterToIncludedInCommit()
    this.closeFilterOptions()
  }

  private onFilterExcludedFiles = () => {
    this.props.onFilterExcludedFiles()
    this.closeFilterOptions()
  }

  private onFilterDeletedFiles = () => {
    this.props.onFilterDeletedFiles()
    this.closeFilterOptions()
  }

  private onFilterModifiedFiles = () => {
    this.props.onFilterModifiedFiles()
    this.closeFilterOptions()
  }

  private onFilterNewFiles = () => {
    this.props.onFilterNewFiles()
    this.closeFilterOptions()
  }

  private onClearAllFilters = () => {
    this.props.onClearAllFilters()
    this.closeFilterOptions()
  }

  // Opens the filter options popover, or closes it if it's already open.
  private toggleFilterOptionsOpen = () => {
    this.setState(prevState => ({
      isFilterOptionsOpen: !prevState.isFilterOptionsOpen,
    }))
  }

  private renderFilterOptions() {
    // Check if any filters are active
    const filtersActive = hasActiveFilters(this.props.fileListFilter)

    const {
      newFilesCount,
      modifiedFilesCount,
      deletedFilesCount,
      excludedFilesCount,
      includedFilesCount,
    } = this.getFilterCounts(this.props.filteredItems)

    return (
      <Popover
        className="filter-popover"
        ariaLabelledby="filter-options-header"
        anchor={this.filterOptionsButtonRef}
        anchorPosition={PopoverAnchorPosition.BottomRight}
        decoration={PopoverDecoration.Balloon}
        onMousedownOutside={this.closeFilterOptions}
        onClickOutside={this.closeFilterOptions}
      >
        <div className="filter-popover-header">
          <h3 id="filter-options-header">Filter Options</h3>
          <button
            className="close"
            onClick={this.closeFilterOptions}
            aria-label="Close"
          >
            <Octicon symbol={octicons.x} />
          </button>
        </div>
        <div className="filter-options">
          <Checkbox
            value={
              this.props.fileListFilter.isIncludedInCommit
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onFilterToIncludedInCommit}
            label={`Included in commit (${includedFilesCount})`}
          />
          <Checkbox
            value={
              this.props.fileListFilter.isExcludedFromCommit
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onFilterExcludedFiles}
            label={`Excluded from commit (${excludedFilesCount})`}
          />
          <Checkbox
            value={
              this.props.fileListFilter.isNewFile
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onFilterNewFiles}
            label={`New files (${newFilesCount})`}
          />
          <Checkbox
            value={
              this.props.fileListFilter.isModifiedFile
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onFilterModifiedFiles}
            label={`Modified files (${modifiedFilesCount})`}
          />
          <Checkbox
            value={
              this.props.fileListFilter.isDeletedFile
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onFilterDeletedFiles}
            label={`Deleted files (${deletedFilesCount})`}
          />
        </div>
        {filtersActive && (
          <div className="filter-options-footer">
            <Button onClick={this.onClearAllFilters}>Clear filters</Button>
          </div>
        )}
      </Popover>
    )
  }

  private onFilterOptionsButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.filterOptionsButtonRef = buttonRef
  }

  public render() {
    const activeFiltersCount = countActiveFilterOptions(
      this.props.fileListFilter
    )
    const hasActiveFilters = activeFiltersCount > 0
    const buttonTextLabel = `Filter Options ${
      hasActiveFilters ? `(${activeFiltersCount} applied)` : ''
    }`

    return (
      <>
        <Button
          className={classNames('filter-button', {
            active: hasActiveFilters,
          })}
          onClick={this.toggleFilterOptionsOpen}
          ariaExpanded={this.state.isFilterOptionsOpen}
          onButtonRef={this.onFilterOptionsButtonRef}
          tooltip={buttonTextLabel}
          ariaLabel={buttonTextLabel}
        >
          <span>
            <Octicon symbol={octicons.filter} />
          </span>
          {hasActiveFilters ? (
            <span className="active-badge">
              <div className="badge-bg">
                <div className="badge"></div>
              </div>
            </span>
          ) : null}
          <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.state.isFilterOptionsOpen && this.renderFilterOptions()}
      </>
    )
  }
}
