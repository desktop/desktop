import * as React from 'react'

import { DefaultDialogFooter, Dialog, DialogContent } from './dialog'
import { PathText } from './lib/path-text'
import {
  GitHubDesktopRepositoryImportOutcome,
  IGitHubDesktopRepositoryImportResult,
} from '../models/popup'

interface IGitHubDesktopRepositoryImportResultsDialogProps {
  readonly results: ReadonlyArray<IGitHubDesktopRepositoryImportResult>
  readonly onDismissed: () => void
}

export class GitHubDesktopRepositoryImportResultsDialog extends React.Component<IGitHubDesktopRepositoryImportResultsDialogProps> {
  public render() {
    const importedCount = this.getCount('imported')
    const skippedCount = this.getCount('skipped')
    const failedCount = this.getCount('failed')

    return (
      <Dialog
        id="github-desktop-repository-import-results"
        title={
          __DARWIN__
            ? 'GitHub Desktop Import Results'
            : 'GitHub Desktop import results'
        }
        ariaDescribedBy="github-desktop-repository-import-results-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
      >
        <DialogContent>
          <p id="github-desktop-repository-import-results-description">
            {importedCount === 0
              ? 'GitHub Desktop repositories were detected, but none were imported.'
              : `Imported ${importedCount} ${
                  importedCount === 1 ? 'repository' : 'repositories'
                } from GitHub Desktop.`}
          </p>
          <p className="description">
            {skippedCount} skipped, {failedCount} failed.
          </p>
          <div className="github-desktop-repository-import-results-list">
            <ul>
              {this.props.results.map(result => (
                <li key={`${result.outcome}:${result.path}`}>
                  <span
                    className={`github-desktop-repository-import-results-status ${result.outcome}`}
                  >
                    {this.getOutcomeLabel(result.outcome)}
                  </span>
                  <div className="github-desktop-repository-import-results-details">
                    <PathText path={result.path} />
                    <span className="description">{result.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>

        <DefaultDialogFooter />
      </Dialog>
    )
  }

  private getCount(outcome: GitHubDesktopRepositoryImportOutcome) {
    return this.props.results.filter(result => result.outcome === outcome)
      .length
  }

  private getOutcomeLabel(outcome: GitHubDesktopRepositoryImportOutcome) {
    switch (outcome) {
      case 'imported':
        return 'Imported'
      case 'skipped':
        return 'Skipped'
      case 'failed':
        return 'Failed'
    }
  }
}
