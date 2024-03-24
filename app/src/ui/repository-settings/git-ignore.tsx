import * as React from 'react'
import { DialogContent } from '../dialog'
import { TextArea } from '../lib/text-area'
import { LinkButton } from '../lib/link-button'
import { Ref } from '../lib/ref'
import {
  getGitIgnoreNames,
  getGitIgnoreText,
} from '../add-repository/gitignores'
import { Select } from '../lib/select'
import { Row } from '../lib/row'

/** The sentinel value used to indicate no gitignore template has been selected. */
const NoGitIgnoreTemplateValue = 'None'

interface IGitIgnoreProps {
  readonly text: string | null
  readonly onIgnoreTextChanged: (text: string) => void
  readonly onShowExamples: () => void
}

interface IGitIgnoreState {
  /** The names of the available gitignore templates. */
  readonly gitIgnoreNames: ReadonlyArray<string> | null

  /** The gitignore template the user has selected */
  readonly gitIgnoreTemplateName: string

  /** Whether or not the component was *initialized* with an empty gitignore. */
  readonly gitIgnoreEmpty: boolean
}

/** A view for creating or modifying the repository's gitignore file */
export class GitIgnore extends React.Component<
  IGitIgnoreProps,
  IGitIgnoreState
> {
  public constructor(props: IGitIgnoreProps) {
    super(props)

    this.state = {
      gitIgnoreNames: null,
      gitIgnoreTemplateName: NoGitIgnoreTemplateValue,
      gitIgnoreEmpty: this.props.text === null || this.props.text.trim() === '',
    }
  }

  public async componentDidMount() {
    const gitIgnoreNames = await getGitIgnoreNames()

    this.setState({ gitIgnoreNames })
  }

  private onTemplateChange = async (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const templateName = event.currentTarget.value
    if (templateName === NoGitIgnoreTemplateValue) {
      this.props.onIgnoreTextChanged('')
    } else {
      const templateText = await getGitIgnoreText(templateName)
      this.props.onIgnoreTextChanged(templateText)
    }
    this.setState({ gitIgnoreTemplateName: templateName })
  }

  private renderTemplates() {
    // Only show template selection UI if the user has an empty gitignore.
    if (!this.state.gitIgnoreEmpty) {
      return null
    }

    const templateNames = this.state.gitIgnoreNames || []
    const options = [NoGitIgnoreTemplateValue, ...templateNames]

    return (
      <Row>
        <Select
          label={__DARWIN__ ? 'Use Ignore Template' : 'Use ignore template'}
          value={this.state.gitIgnoreTemplateName}
          onChange={this.onTemplateChange}
        >
          {options.map(n => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Row>
    )
  }

  public render() {
    return (
      <DialogContent>
        <p>
          Editing <Ref>.gitignore</Ref>. This file specifies intentionally
          untracked files that Git should ignore. Files already tracked by Git
          are not affected.{' '}
          <LinkButton onClick={this.props.onShowExamples}>
            Learn more about gitignore files
          </LinkButton>
        </p>

        {this.renderTemplates()}

        <TextArea
          placeholder="Ignored files"
          value={this.props.text || ''}
          onValueChanged={this.props.onIgnoreTextChanged}
          textareaClassName="gitignore"
        />
      </DialogContent>
    )
  }
}
