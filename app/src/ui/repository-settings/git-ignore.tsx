import * as React from 'react'
import { DialogContent } from '../dialog'
import { TextArea } from '../lib/text-area'
import { LinkButton } from '../lib/link-button'

interface IGitIgnoreProps {
  readonly text: string | null
  readonly onIgnoreTextChanged: (text: string) => void
  readonly onShowExamples: () => void
}

/** A view for creating or modifying the repository's gitignore file */
export class GitIgnore extends React.Component<IGitIgnoreProps, void> {

  public render() {

    return (
      <DialogContent>
        <p>
          The .gitignore file controls which files are tracked by Git and which
          are ignored. Check out <LinkButton onClick={this.props.onShowExamples}>git-scm.com</LinkButton> for
          more information about the file format, or simply ignore a file by
          right clicking on it in the uncommitted changes view.
        </p>
        <TextArea
          placeholder='Ignored files'
          value={this.props.text || ''}
          onChange={this.onChange}
          rows={6} />
      </DialogContent>
    )
  }

  private onChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const text = event.currentTarget.value
    this.props.onIgnoreTextChanged(text)
  }
}
