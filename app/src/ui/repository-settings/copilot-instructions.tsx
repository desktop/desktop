import * as React from 'react'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Ref } from '../lib/ref'
import { TextArea } from '../lib/text-area'

interface ICopilotInstructionsProps {
  readonly text: string | null
  readonly onInstructionsTextChanged: (text: string) => void
  readonly onShowExamples: () => void
}

/** A view for creating or modifying the repository's copilot commit instructions file */
export class CopilotInstructions extends React.Component<
  ICopilotInstructionsProps,
  {}
> {
  public render() {
    return (
      <DialogContent>
        <p id="copilot-instructions-description">
          Editing <Ref>.github/copilot-commit-instructions.md</Ref>. This file
          contains custom instructions for Copilot when generating commit
          messages.{' '}
          <LinkButton onClick={this.props.onShowExamples}>
            Learn more about Copilot commit message generation
          </LinkButton>
        </p>

        <TextArea
          ariaLabel="Copilot commit instructions"
          ariaDescribedBy="copilot-instructions-description"
          placeholder="Enter custom instructions for commit message generation...

Example:
- Use conventional commit format (feat:, fix:, docs:, etc.)
- Keep the summary under 50 characters
- Explain the 'why' not just the 'what'"
          value={this.props.text || ''}
          onValueChanged={this.props.onInstructionsTextChanged}
          textareaClassName="copilot-instructions"
        />
      </DialogContent>
    )
  }
}
