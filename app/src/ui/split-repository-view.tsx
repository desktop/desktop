import * as React from 'react'
import classNames from 'classnames'
import {
  IConstrainedValue,
  IRepositoryState,
  PossibleSelections,
  SelectionType,
} from '../lib/app-state'
import { Repository } from '../models/repository'
import { SplitPane, SplitToolbarMode } from '../models/split-view'
import { Dispatcher } from './dispatcher'
import { Button } from './lib/button'
import { Octicon } from './octicons'
import * as octicons from './octicons/octicons.generated'
import { clamp } from '../lib/clamp'
import { UiView } from './ui-view'

interface ISplitRepositoryViewProps {
  readonly primary: Extract<
    PossibleSelections,
    { type: SelectionType.Repository }
  >
  readonly secondary: Extract<
    PossibleSelections,
    { type: SelectionType.Repository }
  >
  readonly focusedPane: SplitPane
  readonly toolbarMode: SplitToolbarMode
  readonly splitPaneWidth: IConstrainedValue
  readonly dispatcher: Dispatcher
  readonly renderRepository: (
    repository: Repository,
    state: IRepositoryState
  ) => JSX.Element
  /**
   * Renders branch / push-pull controls for a specific pane when using
   * per-pane toolbar mode.
   */
  readonly renderPaneToolbar: (
    pane: SplitPane,
    repository: Repository,
    state: IRepositoryState
  ) => JSX.Element
}

interface ISplitRepositoryViewState {
  readonly isDragging: boolean
}

/**
 * Side-by-side layout hosting two repository views with a resizable divider.
 */
export class SplitRepositoryView extends React.Component<
  ISplitRepositoryViewProps,
  ISplitRepositoryViewState
> {
  /** Keep in sync with `$split-divider-width` in _split-repository.scss. */
  private static readonly dividerWidth = 6

  private containerRef: HTMLDivElement | null = null
  private startX: number | null = null
  private startWidth: number | null = null

  public constructor(props: ISplitRepositoryViewProps) {
    super(props)
    this.state = { isDragging: false }
  }

  public componentWillUnmount() {
    this.unsubscribeFromGlobalEvents()
  }

  public render() {
    const { primary, secondary, focusedPane, splitPaneWidth } = this.props
    const primaryWidthPercent = clamp(splitPaneWidth)

    return (
      <UiView id="split-repository" className="split-repository-view">
        <div
          className={classNames('split-repository-panes', {
            dragging: this.state.isDragging,
          })}
          ref={this.onContainerRef}
        >
          <div
            className="split-repository-primary"
            style={{
              // Half the divider is taken out of each pane so that an even
              // split is pixel-identical on both sides.
              flexBasis: `calc(${primaryWidthPercent}% - ${
                SplitRepositoryView.dividerWidth / 2
              }px)`,
            }}
          >
            {this.renderPane(
              SplitPane.Primary,
              primary.repository,
              primary.state,
              focusedPane === SplitPane.Primary,
              false
            )}
          </div>
          <div
            className="split-repository-divider"
            onMouseDown={this.onDividerMouseDown}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(primaryWidthPercent)}
            aria-valuemin={Math.round(splitPaneWidth.min)}
            aria-valuemax={Math.round(splitPaneWidth.max)}
            tabIndex={0}
            onKeyDown={this.onDividerKeyDown}
            onDoubleClick={this.onDividerDoubleClick}
          />
          <div className="split-repository-secondary">
            {this.renderPane(
              SplitPane.Secondary,
              secondary.repository,
              secondary.state,
              focusedPane === SplitPane.Secondary,
              true
            )}
          </div>
        </div>
      </UiView>
    )
  }

  private renderPane(
    pane: SplitPane,
    repository: Repository,
    state: IRepositoryState,
    isFocused: boolean,
    showClose: boolean
  ) {
    const { toolbarMode, renderRepository, renderPaneToolbar } = this.props
    const className = classNames('split-repository-pane', {
      focused: isFocused,
    })
    const title = repository.alias ?? repository.name

    return (
      <div
        className={className}
        onMouseDown={() => this.onPaneMouseDown(pane)}
        role="group"
        aria-label={repository.name}
      >
        {toolbarMode === SplitToolbarMode.PerPane ? (
          <div
            className={classNames('split-repository-pane-toolbar', {
              focused: isFocused,
            })}
          >
            {renderPaneToolbar(pane, repository, state)}
            {showClose && this.renderCloseButton()}
          </div>
        ) : (
          showClose && (
            <div
              className={classNames('split-repository-pane-header', {
                focused: isFocused,
              })}
            >
              <div
                className="split-repository-pane-identity"
                title={repository.path}
              >
                <span className="split-repository-pane-title">{title}</span>
              </div>
              {this.renderCloseButton()}
            </div>
          )
        )}
        <div className="split-repository-pane-content">
          {renderRepository(repository, state)}
        </div>
      </div>
    )
  }

  private renderCloseButton() {
    return (
      <Button
        onClick={this.onCloseSplit}
        tooltip={__DARWIN__ ? 'Close Split View' : 'Close split view'}
        ariaLabel={__DARWIN__ ? 'Close Split View' : 'Close split view'}
        className="split-repository-close-button"
      >
        <Octicon symbol={octicons.x} />
      </Button>
    )
  }

  private onContainerRef = (ref: HTMLDivElement | null) => {
    this.containerRef = ref
  }

  private onPaneMouseDown = (pane: SplitPane) => {
    if (pane !== this.props.focusedPane) {
      this.props.dispatcher.setFocusedSplitPane(pane)
    }
  }

  private onCloseSplit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    this.props.dispatcher.closeSplitView()
  }

  private onDividerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    this.startX = e.clientX
    this.startWidth = clamp(this.props.splitPaneWidth)
    this.setState({ isDragging: true })
    document.addEventListener('mousemove', this.onDividerMouseMove)
    document.addEventListener('mouseup', this.onDividerMouseUp)
  }

  private onDividerMouseMove = (e: MouseEvent) => {
    if (
      this.startX === null ||
      this.startWidth === null ||
      this.containerRef === null
    ) {
      return
    }

    const containerWidth = this.containerRef.getBoundingClientRect().width
    if (containerWidth <= 0) {
      return
    }

    const deltaPercent = ((e.clientX - this.startX) / containerWidth) * 100
    const { min, max } = this.props.splitPaneWidth
    const next = Math.min(max, Math.max(min, this.startWidth + deltaPercent))
    this.props.dispatcher.setSplitPaneWidth(next)
  }

  private onDividerMouseUp = () => {
    this.unsubscribeFromGlobalEvents()
    this.startX = null
    this.startWidth = null
    this.setState({ isDragging: false })
  }

  private onDividerDoubleClick = () => {
    this.props.dispatcher.resetSplitPaneWidth()
  }

  private onDividerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 1
    const current = clamp(this.props.splitPaneWidth)
    const { min, max } = this.props.splitPaneWidth

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      this.props.dispatcher.setSplitPaneWidth(Math.max(min, current - step))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      this.props.dispatcher.setSplitPaneWidth(Math.min(max, current + step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      this.props.dispatcher.setSplitPaneWidth(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      this.props.dispatcher.setSplitPaneWidth(max)
    }
  }

  private unsubscribeFromGlobalEvents() {
    document.removeEventListener('mousemove', this.onDividerMouseMove)
    document.removeEventListener('mouseup', this.onDividerMouseUp)
  }
}
