import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { SuggestedBranchNames } from '../../lib/helpers/default-branch'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Ref } from '../lib/ref'
import { RadioButton } from '../lib/radio-button'

interface IGitProps {
  readonly name: string
  readonly email: string
  readonly defaultBranch: string

  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
  readonly onDefaultBranchChanged: (defaultBranch: string) => void
}

// This will be the prepopulated branch name on the "other" input
// field when the user selects it.
const OtherNameForDefaultBranch = ''

export class Git extends React.Component<IGitProps> {
  public render() {
    const defaultBranchIsOther = !SuggestedBranchNames.includes(
      this.props.defaultBranch
    )

    return (
      <DialogContent>
        <Row>
          <TextBox
            label="Name"
            value={this.props.name}
            onValueChanged={this.props.onNameChanged}
          />
        </Row>
        <Row>
          <TextBox
            label="Email"
            value={this.props.email}
            onValueChanged={this.props.onEmailChanged}
          />
        </Row>

        <p className="default-branch-title">
          Default branch on new repositories
        </p>

        <div className="default-branch-component">
          {SuggestedBranchNames.map((branchName: string) => (
            <RadioButton
              key={branchName}
              checked={this.props.defaultBranch === branchName}
              value={branchName}
              label={branchName}
              onSelected={this.onDefaultBranchChanged}
            />
          ))}
          <RadioButton
            key={OtherNameForDefaultBranch}
            checked={defaultBranchIsOther}
            value={OtherNameForDefaultBranch}
            label="Other…"
            onSelected={this.onDefaultBranchChanged}
          />
        </div>

        {defaultBranchIsOther && (
          <RefNameTextBox
            initialValue={this.props.defaultBranch}
            renderWarningMessage={this.renderWarningMessage}
            onValueChange={this.props.onDefaultBranchChanged}
          />
        )}
        <p className="git-settings-description">
          These preferences will edit your global Git config.
        </p>
      </DialogContent>
    )
  }

  private renderWarningMessage = (
    sanitizedBranchName: string,
    proposedBranchName: string
  ) => {
    if (sanitizedBranchName === '') {
      return (
        <>
          <Ref>{proposedBranchName}</Ref> is an invalid branch name.
        </>
      )
    }

    return (
      <>
        Will be saved as <Ref>{sanitizedBranchName}</Ref>.
      </>
    )
  }

  private onDefaultBranchChanged = (defaultBranch: string) => {
    this.props.onDefaultBranchChanged(defaultBranch)
  }
}
