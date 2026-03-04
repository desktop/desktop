import * as React from 'react'
import { ICommitSuggestion } from '../../models/commit-suggestion'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
interface ISuggestedCommitListProps {
  readonly suggestions: ReadonlyArray<ICommitSuggestion>
  readonly isCommitting: boolean
  readonly onSuggestionsUpdated: (
    suggestions: ReadonlyArray<ICommitSuggestion>
  ) => void
  readonly onCommitAll: (suggestions: ReadonlyArray<ICommitSuggestion>) => void
  readonly onRegenerate: () => void
  readonly onDismiss: () => void
}

interface ISuggestedCommitListState {
  /** Index of the suggestion whose description is expanded, or -1 */
  readonly expandedIndex: number
}

/**
 * Renders a list of AI-suggested commits, each editable, toggleable,
 * and reorderable. Used for the smart commit split feature.
 */
export class SuggestedCommitList extends React.Component<
  ISuggestedCommitListProps,
  ISuggestedCommitListState
> {
  public constructor(props: ISuggestedCommitListProps) {
    super(props)
    this.state = {
      expandedIndex: -1,
      editingSummaries: new Map(),
      editingDescriptions: new Map(),
    }
  }

  private onToggleEnabled = (index: number) => {
    const updated = this.props.suggestions.map((s, i) =>
      i === index ? { ...s, enabled: !s.enabled } : s
    )
    this.props.onSuggestionsUpdated(updated)
  }

  private onSummaryChanged = (index: number, value: string) => {
    this.setState(prev => {
      const next = new Map(prev.editingSummaries)
      next.set(index, value)
      return { editingSummaries: next }
    })
  }

  private onSummaryBlur = (index: number) => {
    const localValue = this.state.editingSummaries.get(index)
    if (localValue === undefined) {
      return
    }

    // Clear local state first
    this.setState(prev => {
      const next = new Map(prev.editingSummaries)
      next.delete(index)
      return { editingSummaries: next }
    })

    // Flush to store
    const suggestion = this.props.suggestions[index]
    if (suggestion && suggestion.summary !== localValue) {
      const updated = this.props.suggestions.map((s, i) =>
        i === index ? { ...s, summary: localValue } : s
      )
      this.props.onSuggestionsUpdated(updated)
    }
  }

  private onDescriptionChanged = (index: number, value: string) => {
    this.setState(prev => {
      const next = new Map(prev.editingDescriptions)
      next.set(index, value)
      return { editingDescriptions: next }
    })
  }

  private onDescriptionBlur = (index: number) => {
    const localValue = this.state.editingDescriptions.get(index)
    if (localValue === undefined) {
      return
    }

    // Clear local state first
    this.setState(prev => {
      const next = new Map(prev.editingDescriptions)
      next.delete(index)
      return { editingDescriptions: next }
    })

    // Flush to store
    const suggestion = this.props.suggestions[index]
    if (suggestion && suggestion.description !== localValue) {
      const updated = this.props.suggestions.map((s, i) =>
        i === index ? { ...s, description: localValue } : s
      )
      this.props.onSuggestionsUpdated(updated)
    }
  }

  private onMoveUp = (index: number) => {
    if (index <= 0) {
      return
    }
    const items = [...this.props.suggestions]
    const temp = items[index - 1]
    items[index - 1] = items[index]
    items[index] = temp
    this.props.onSuggestionsUpdated(items)
  }

  private onMoveDown = (index: number) => {
    if (index >= this.props.suggestions.length - 1) {
      return
    }
    const items = [...this.props.suggestions]
    const temp = items[index + 1]
    items[index + 1] = items[index]
    items[index] = temp
    this.props.onSuggestionsUpdated(items)
  }

  private onToggleExpanded = (index: number) => {
    this.setState(prev => ({
      expandedIndex: prev.expandedIndex === index ? -1 : index,
    }))
  }

  private onCommitAll = () => {
    this.props.onCommitAll(this.props.suggestions)
  }

  private renderSuggestionCard(
    suggestion: ICommitSuggestion,
    index: number
  ): JSX.Element {
    const isExpanded = this.state.expandedIndex === index
    const isFirst = index === 0
    const isLast = index === this.props.suggestions.length - 1
    const cardClassName = `suggested-commit-card${
      suggestion.enabled ? '' : ' disabled'
    }`

    return (
      <div className={cardClassName} key={index}>
        <div className="suggested-commit-card-header">
          <label className="suggested-commit-toggle">
            <input
              type="checkbox"
              checked={suggestion.enabled}
              onChange={() => this.onToggleEnabled(index)}
              disabled={this.props.isCommitting}
            />
          </label>
          <input
            className="suggested-commit-summary"
            type="text"
            value={suggestion.summary}
            onChange={e => this.onSummaryChanged(index, e.currentTarget.value)}
            placeholder="Commit summary"
            disabled={!suggestion.enabled || this.props.isCommitting}
          />
          <div className="suggested-commit-reorder">
            <button
              className="reorder-btn"
              onClick={() => this.onMoveUp(index)}
              disabled={isFirst || this.props.isCommitting}
              aria-label="Move up"
              title="Move up"
            >
              <Octicon symbol={octicons.chevronUp} />
            </button>
            <button
              className="reorder-btn"
              onClick={() => this.onMoveDown(index)}
              disabled={isLast || this.props.isCommitting}
              aria-label="Move down"
              title="Move down"
            >
              <Octicon symbol={octicons.chevronDown} />
            </button>
          </div>
        </div>

        <button
          className="suggested-commit-expand-toggle"
          onClick={() => this.onToggleExpanded(index)}
          aria-label={
            isExpanded ? 'Collapse description' : 'Expand description'
          }
        >
          <Octicon
            symbol={isExpanded ? octicons.chevronDown : octicons.chevronRight}
          />
          <span className="expand-label">
            {isExpanded ? 'Hide description' : 'Show description'}
          </span>
        </button>

        {isExpanded && (
          <textarea
            className="suggested-commit-description"
            value={suggestion.description}
            onChange={e =>
              this.onDescriptionChanged(index, e.currentTarget.value)
            }
            placeholder="Optional description"
            disabled={!suggestion.enabled || this.props.isCommitting}
            rows={3}
          />
        )}

        <div className="suggested-commit-files">
          {suggestion.files.map(file => (
            <span className="suggested-commit-file" key={file}>
              <Octicon symbol={octicons.file} />
              {file}
            </span>
          ))}
        </div>
      </div>
    )
  }

  public render() {
    const { suggestions, isCommitting } = this.props
    const enabledCount = suggestions.filter(s => s.enabled).length

    return (
      <div className="suggested-commit-list">
        <div className="suggested-commit-list-header">
          <h3>
            <Octicon symbol={octicons.copilot} />
            Smart Split
          </h3>
          <span className="suggestion-count">
            {enabledCount}/{suggestions.length} selected
          </span>
        </div>

        <div className="suggested-commit-cards">
          {suggestions.map((s, i) => this.renderSuggestionCard(s, i))}
        </div>

        <div className="suggested-commit-list-actions">
          <Button
            className="commit-all-button"
            type="submit"
            disabled={enabledCount === 0 || isCommitting}
            onClick={this.onCommitAll}
          >
            {isCommitting
              ? 'Committing…'
              : `Commit ${enabledCount} change${enabledCount !== 1 ? 's' : ''}`}
          </Button>
          <Button
            className="regenerate-button"
            disabled={isCommitting}
            onClick={this.props.onRegenerate}
            tooltip="Regenerate suggestions with current format"
          >
            <Octicon symbol={octicons.sync} />
          </Button>
          <Button
            className="dismiss-button"
            disabled={isCommitting}
            onClick={this.props.onDismiss}
            tooltip="Dismiss suggestions"
          >
            <Octicon symbol={octicons.x} />
          </Button>
        </div>
      </div>
    )
  }
}
