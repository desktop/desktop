import * as React from 'react'
import { Popover, PopoverAnchorPosition } from '../lib/popover'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  IAPIProjectField,
  IAPIProjectV2View,
} from '../../lib/api'

interface IViewOptionsDropdownProps {
  readonly view: IAPIProjectV2View
  readonly allFields: ReadonlyArray<IAPIProjectField>
}

interface IViewOptionsDropdownState {
  readonly isOpen: boolean
  readonly expandedSection: string | null
}

export class ViewOptionsDropdown extends React.Component<
  IViewOptionsDropdownProps,
  IViewOptionsDropdownState
> {
  private buttonRef: HTMLButtonElement | null = null

  public constructor(props: IViewOptionsDropdownProps) {
    super(props)
    this.state = {
      isOpen: false,
      expandedSection: null,
    }
  }

  private onButtonRef = (ref: HTMLButtonElement | null) => {
    this.buttonRef = ref
  }

  private toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation()
    this.setState({ isOpen: !this.state.isOpen, expandedSection: null })
  }

  private closeDropdown = () => {
    this.setState({ isOpen: false, expandedSection: null })
  }

  private toggleSection = (section: string) => {
    this.setState({
      expandedSection: this.state.expandedSection === section ? null : section,
    })
  }

  private getVisibleFieldIds(): Set<string> {
    const { view } = this.props
    return new Set(view.visibleFields?.map(f => f.id) || [])
  }

  private renderFieldsSection() {
    const { allFields, view } = this.props
    const isExpanded = this.state.expandedSection === 'fields'
    const visibleFieldIds = this.getVisibleFieldIds()

    const visibleFields = view.visibleFields || []
    const hiddenFields = allFields.filter(f => !visibleFieldIds.has(f.id))

    return (
      <div className="view-option-section">
        <button
          className="view-option-header"
          onClick={() => this.toggleSection('fields')}
        >
          <span className="option-title">Fields</span>
          <span className="option-value">{visibleFields.length} visible</span>
          <Octicon
            symbol={isExpanded ? octicons.chevronUp : octicons.chevronDown}
          />
        </button>
        {isExpanded && (
          <div className="view-option-content fields-content">
            {visibleFields.length > 0 && (
              <>
                <div className="fields-group-label">Visible fields</div>
                {visibleFields.map(field => (
                  <div key={field.id} className="field-item">
                    <Octicon symbol={octicons.eye} className="visible-icon" />
                    <span>{field.name}</span>
                  </div>
                ))}
              </>
            )}
            {hiddenFields.length > 0 && (
              <>
                <div className="fields-group-label">Hidden fields</div>
                {hiddenFields.map(field => (
                  <div key={field.id} className="field-item hidden">
                    <Octicon symbol={octicons.eyeClosed} className="hidden-icon" />
                    <span>{field.name}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  private renderSection(
    title: string,
    sectionKey: string,
    values: ReadonlyArray<{ id: string; name: string }> | undefined
  ) {
    const isExpanded = this.state.expandedSection === sectionKey
    const displayValue = values && values.length > 0
      ? values.map(v => v.name).join(', ')
      : 'None'

    return (
      <div className="view-option-section">
        <button
          className="view-option-header"
          onClick={() => this.toggleSection(sectionKey)}
        >
          <span className="option-title">{title}</span>
          <span className="option-value">{displayValue}</span>
          <Octicon
            symbol={isExpanded ? octicons.chevronUp : octicons.chevronDown}
          />
        </button>
        {isExpanded && (
          <div className="view-option-content">
            {values && values.length > 0 ? (
              values.map(v => (
                <div key={v.id} className="field-item selected">
                  <Octicon symbol={octicons.check} />
                  <span>{v.name}</span>
                </div>
              ))
            ) : (
              <div className="field-item empty">
                <span>Not configured</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  private renderSortBySection() {
    const { view } = this.props
    const isExpanded = this.state.expandedSection === 'sortBy'
    const sortBy = view.sortBy

    const displayValue = sortBy && sortBy.length > 0
      ? sortBy.map(s => `${s.field.name} (${s.direction})`).join(', ')
      : 'None'

    return (
      <div className="view-option-section">
        <button
          className="view-option-header"
          onClick={() => this.toggleSection('sortBy')}
        >
          <span className="option-title">Sort by</span>
          <span className="option-value">{displayValue}</span>
          <Octicon
            symbol={isExpanded ? octicons.chevronUp : octicons.chevronDown}
          />
        </button>
        {isExpanded && (
          <div className="view-option-content">
            {sortBy && sortBy.length > 0 ? (
              sortBy.map((s, idx) => (
                <div key={idx} className="field-item selected">
                  <Octicon symbol={s.direction === 'ASC' ? octicons.sortAsc : octicons.sortDesc} />
                  <span>{s.field.name}</span>
                  <span className="sort-direction">{s.direction === 'ASC' ? 'Ascending' : 'Descending'}</span>
                </div>
              ))
            ) : (
              <div className="field-item empty">
                <span>Not configured</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  private renderFilterSection() {
    const { view } = this.props
    const isExpanded = this.state.expandedSection === 'filter'
    const filter = view.filter

    return (
      <div className="view-option-section">
        <button
          className="view-option-header"
          onClick={() => this.toggleSection('filter')}
        >
          <span className="option-title">Filter</span>
          <span className="option-value">{filter ? 'Active' : 'None'}</span>
          <Octicon
            symbol={isExpanded ? octicons.chevronUp : octicons.chevronDown}
          />
        </button>
        {isExpanded && (
          <div className="view-option-content">
            {filter ? (
              <div className="filter-value">
                <code>{filter}</code>
              </div>
            ) : (
              <div className="field-item empty">
                <span>No filter applied</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  private renderPopover() {
    if (!this.state.isOpen) {
      return null
    }

    const { view } = this.props

    return (
      <Popover
        className="view-options-popover"
        anchor={this.buttonRef}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        onClickOutside={this.closeDropdown}
        trapFocus={false}
      >
        <div className="view-options-dropdown">
          <div className="view-options-header">
            <span>{view.name} - View settings</span>
            <button className="close-button" onClick={this.closeDropdown}>
              <Octicon symbol={octicons.x} />
            </button>
          </div>
          <div className="view-options-body">
            {this.renderFieldsSection()}
            {this.renderSection(
              'Column by',
              'columnBy',
              view.groupBy
            )}
            {this.renderSection(
              'Swimlanes',
              'swimlanes',
              view.verticalGroupBy
            )}
            {this.renderSortBySection()}
            {this.renderFilterSection()}
          </div>
          <div className="view-options-footer">
            <div className="view-info">
              <Octicon symbol={octicons.info} />
              <span>View settings are configured on GitHub</span>
            </div>
          </div>
        </div>
      </Popover>
    )
  }

  public render() {
    return (
      <div className="view-options-dropdown-container">
        <button
          ref={this.onButtonRef}
          className={`view-options-button ${this.state.isOpen ? 'open' : ''}`}
          onClick={this.toggleDropdown}
          title="View options"
        >
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {this.renderPopover()}
      </div>
    )
  }
}
