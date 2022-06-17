import * as React from 'react'

import { LinkButton } from '../lib/link-button'
import { SuggestedAction } from '../suggested-actions'
import { SuggestedActionGroup } from '../suggested-actions'
import { Commit } from '../../models/commit'

interface IMultipleCommitsSelectedProps {
  /** The commits in the users selection */
  readonly selectedCommits: ReadonlyArray<Commit>

  /** Method to execute comparing the first and last sha of the selection */
  readonly onDiffFirstAndLastSelectedCommits?: () => void
}

/** The component to display where multiple commits have been selected. */
export class MultipleCommitsSelected extends React.Component<IMultipleCommitsSelectedProps> {
  private onDiffCommits = () => {
    this.props.onDiffFirstAndLastSelectedCommits?.()
  }

  private renderNonActionSuggestions() {
    const description = (
      <>
        <span>Onto a branch in the branch menu to cherry-pick them.</span>
        <br />
        <span>Onto another commit to squash them.</span>
        <br />
        <span>To a different position in the history to reorder them.</span>
        <br />
      </>
    )
    return (
      <SuggestedAction
        title={'Drag and drop them...'}
        description={description}
      ></SuggestedAction>
    )
  }
  private renderDiffSuggestion = () => {
    const { selectedCommits } = this.props
    const description = (
      <>
        This diff may not include all the commits in your selection.{' '}
        <LinkButton> Learn why? </LinkButton>
      </>
    )
    return (
      <SuggestedAction
        title={`Diff the first sha (${
          selectedCommits[0]?.shortSha
        }^) and last sha (${selectedCommits.at(-1)?.shortSha})`}
        description={description}
        buttonText={'Diff'}
        onClick={this.onDiffCommits}
      />
    )
  }

  public render() {
    return (
      <div className="multiple-commits-selected-suggestions">
        <div className="content">
          <div className="header">
            <div>
              <h1>Multiple commits selected</h1>
              <p>
                You have selected multiple commits. Here are some friendly
                suggestions for what you can do.
              </p>
            </div>
          </div>

          <SuggestedActionGroup>
            {this.renderNonActionSuggestions()}
            {this.renderDiffSuggestion()}
          </SuggestedActionGroup>
        </div>
      </div>
    )
  }
}
