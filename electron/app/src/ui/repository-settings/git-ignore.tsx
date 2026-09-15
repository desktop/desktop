import * as React from 'react'
import { DialogContent } from '../dialog'
import { TextArea } from '../lib/text-area'
import { LinkButton } from '../lib/link-button'
import { Ref } from '../lib/ref'

interface IGitIgnoreProps {
  readonly text: string | null
  readonly onIgnoreTextChanged: (text: string) => void
  readonly onShowExamples: () => void
}

/** A view for creating or modifying the repository's gitignore file */
export class GitIgnore extends React.Component<IGitIgnoreProps, {}> {
  public render() {
    return (
      <DialogContent>
        <p id="ignored-files-description">
          Editing <Ref>.gitignore</Ref>. This file specifies intentionally
          untracked files that Git should ignore. Files already tracked by Git
          are not affected.{' '}
          <LinkButton onClick={this.props.onShowExamples}>
            Learn more about gitignore files
          </LinkButton>
        </p>

        <TextArea
          ariaLabel="Ignored files"
          ariaDescribedBy="ignored-files-description"
          placeholder="Ignored files"
          value={this.props.text || ''}
          onValueChanged={this.props.onIgnoreTextChanged}
          textareaClassName="gitignore"
        />
      </DialogContent>
    )
  }
}
