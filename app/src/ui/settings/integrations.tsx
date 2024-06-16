import * as React from 'react'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IIntegrationsSettingsProps {
  readonly copilotEnabled: boolean
  readonly onCopilotEnabledChanged: (enabled: boolean) => void
}

export class IntegrationsSettings extends React.Component<IIntegrationsSettingsProps, {}> {
  public render() {
    return (
      <div id="integrations-settings">
        <h2>Integrations</h2>
        <Row>
          <Checkbox
            label="Enable GitHub Copilot"
            value={this.props.copilotEnabled ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onCopilotEnabledChanged}
          />
          <p>
            GitHub Copilot is powered by Codex from OpenAI. Enable it to get AI-powered code suggestions in supported file types.
          </p>
        </Row>
      </div>
    )
  }

  private onCopilotEnabledChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked
    this.props.onCopilotEnabledChanged(value)
  }
}
