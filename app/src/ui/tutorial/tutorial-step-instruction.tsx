/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import * as React from 'react'
import {
  ValidTutorialStep,
  orderedTutorialSteps,
} from '../../models/tutorial-step'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ITutorialStepInstructionsProps {
  /** Text displayed to summarize this step */
  readonly summaryText: string
  /** Used to find out if this step has been completed */
  readonly isComplete: (step: ValidTutorialStep) => boolean
  /** The step for this section */
  readonly sectionId: ValidTutorialStep
  /** Used to find out if this is the next step for the user to complete */
  readonly isNextStepTodo: (step: ValidTutorialStep) => boolean

  /** ID of the currently expanded tutorial step
   * (used to determine if this step is expanded)
   */
  readonly currentlyOpenSectionId: ValidTutorialStep

  /** Skip button (if possible for this step) */
  readonly skipLinkButton?: JSX.Element
  /** Handler to open and close section */
  readonly onSummaryClick: (id: ValidTutorialStep) => void
}

/** A step (summary and expandable description) in the tutorial side panel */
export class TutorialStepInstructions extends React.Component<ITutorialStepInstructionsProps> {
  public render() {
    return (
      <li key={this.props.sectionId} onClick={this.onSummaryClick}>
        <details
          open={this.props.sectionId === this.props.currentlyOpenSectionId}
          onClick={this.onSummaryClick}
        >
          {this.renderSummary()}
          <div className="contents">{this.props.children}</div>
        </details>
      </li>
    )
  }

  private renderSummary = () => {
    const shouldShowSkipLink =
      this.props.skipLinkButton !== undefined &&
      this.props.currentlyOpenSectionId === this.props.sectionId &&
      this.props.isNextStepTodo(this.props.sectionId)
    return (
      <summary>
        {this.renderTutorialStepIcon()}
        <span className="summary-text">{this.props.summaryText}</span>
        <span className="hang-right">
          {shouldShowSkipLink ? (
            this.props.skipLinkButton
          ) : (
            <Octicon symbol={octicons.chevronDown} />
          )}
        </span>
      </summary>
    )
  }

  private renderTutorialStepIcon() {
    if (this.props.isComplete(this.props.sectionId)) {
      return (
        <div className="green-circle">
          <Octicon symbol={octicons.check} />
        </div>
      )
    }

    // ugh zero-indexing
    const stepNumber = orderedTutorialSteps.indexOf(this.props.sectionId) + 1
    return this.props.isNextStepTodo(this.props.sectionId) ? (
      <div className="blue-circle">{stepNumber}</div>
    ) : (
      <div className="empty-circle">{stepNumber}</div>
    )
  }

  private onSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
    // prevents the default behavior of toggling on a `details` html element
    // so we don't have to fight it with our react state
    // for more info see:
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details#Events
    e.preventDefault()
    this.props.onSummaryClick(this.props.sectionId)
  }
}
