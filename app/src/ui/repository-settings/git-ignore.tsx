import * as React from 'react'
import { DialogContent } from '../dialog'
import { TextArea } from '../lib/text-area'

interface IGitIgnoreProps {
  readonly text: string | null
  readonly onIgnoreTextChanged: (text: string) => void
}

/** A view for creating or modifying the repository's gitignore file */
export class GitIgnore extends React.Component<IGitIgnoreProps, void> {

  public render() {

    return (
      <DialogContent>
        <div>Ignored files (.gitignore)</div>
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
