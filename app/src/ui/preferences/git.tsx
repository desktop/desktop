import * as React from 'react'
import { DialogContent } from '../dialog'
import { SuggestedBranchNames } from '../../lib/helpers/default-branch'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Ref } from '../lib/ref'
import { RadioButton } from '../lib/radio-button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Account } from '../../models/account'
import { GitConfigUserForm } from '../lib/git-config-user-form'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'

interface IGitProps {
  readonly name: string
  readonly email: string
  readonly defaultBranch: string
  readonly mergeTool: string
  readonly mergeToolCommand: string
  readonly useCustomMergeTool: boolean

  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null

  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
  readonly onDefaultBranchChanged: (defaultBranch: string) => void
  readonly onUseCustomMergeToolChanged: (enabled: boolean) => void
  readonly onMergeToolChanged: (mergeTool: string) => void
  readonly onMergeToolCommandChanged: (mergeToolCommand: string) => void
}

interface IGitState {
  /**
   * True if the default branch setting is not one of the suggestions.
   * It's used to display the "Other" text box that allows the user to
   * enter a custom branch name.
   */
  readonly defaultBranchIsOther: boolean
}

// This will be the prepopulated branch name on the "other" input
// field when the user selects it.
const OtherNameForDefaultBranch = ''

export class Git extends React.Component<IGitProps, IGitState> {
  private defaultBranchInputRef = React.createRef<RefNameTextBox>()

  public constructor(props: IGitProps) {
    super(props)

    this.state = {
      defaultBranchIsOther: !SuggestedBranchNames.includes(
        this.props.defaultBranch
      ),
    }
  }

  public componentDidUpdate(prevProps: IGitProps) {
    // Focus the text input that allows the user to enter a custom
    // branch name when the user has selected "Other...".
    if (
      this.props.defaultBranch !== prevProps.defaultBranch &&
      this.props.defaultBranch === OtherNameForDefaultBranch &&
      this.defaultBranchInputRef.current !== null
    ) {
      this.defaultBranchInputRef.current.focus()
    }
  }

  public render() {
    return (
      <DialogContent>
        {this.renderGitConfigAuthorInfo()}
        {this.renderDefaultBranchSetting()}
        {this.renderMergeToolSetting()}
      </DialogContent>
    )
  }

  private renderGitConfigAuthorInfo() {
    return (
      <GitConfigUserForm
        email={this.props.email}
        name={this.props.name}
        enterpriseAccount={this.props.enterpriseAccount}
        dotComAccount={this.props.dotComAccount}
        onEmailChanged={this.props.onEmailChanged}
        onNameChanged={this.props.onNameChanged}
      />
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

  private renderDefaultBranchSetting() {
    const { defaultBranchIsOther } = this.state

    return (
      <div className="default-branch-component">
        <h2>Default branch for new repositories</h2>

        {SuggestedBranchNames.map((branchName: string) => (
          <RadioButton
            key={branchName}
            checked={
              !defaultBranchIsOther && this.props.defaultBranch === branchName
            }
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

        {defaultBranchIsOther && (
          <RefNameTextBox
            initialValue={this.props.defaultBranch}
            renderWarningMessage={this.renderWarningMessage}
            onValueChange={this.props.onDefaultBranchChanged}
            ref={this.defaultBranchInputRef}
          />
        )}
      </div>
    )
  }

  private onUseCustomMergeToolEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onUseCustomMergeToolChanged(event.currentTarget.checked)
  }

  private renderMergeToolSetting() {
    return (
      <div className="merge-tool-component">
        <h2>Merge Tool</h2>

        <Row>
          <Checkbox
            label="Use custom merge tool"
            value={
              this.props.useCustomMergeTool
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onUseCustomMergeToolEnabledChanged}
          />
        </Row>
        <Row>
          <TextBox
            label="Merge Tool Name"
            value={this.props.mergeTool}
            onValueChanged={this.props.onMergeToolChanged}
            disabled={!this.props.useCustomMergeTool}
          />
        </Row>
        <Row>
          <TextBox
            label="Merge Tool Command"
            value={this.props.mergeToolCommand}
            onValueChanged={this.props.onMergeToolCommandChanged}
            disabled={!this.props.useCustomMergeTool}
          />
        </Row>
        <p className="git-settings-description">
          These preferences will edit your global Git config.
        </p>
      </div>
    )
  }

  /**
   * Handler to make sure that we show/hide the text box to enter a custom
   * branch name when the user clicks on one of the radio buttons.
   *
   * We don't want to call this handler on changes to the text box since that
   * will cause the text box to be hidden if the user types a branch name
   * that starts with one of the suggested branch names (e.g `mainXYZ`).
   *
   * @param defaultBranch string the selected default branch
   */
  private onDefaultBranchChanged = (defaultBranch: string) => {
    this.setState({
      defaultBranchIsOther: !SuggestedBranchNames.includes(defaultBranch),
    })

    this.props.onDefaultBranchChanged(defaultBranch)
  }
}
