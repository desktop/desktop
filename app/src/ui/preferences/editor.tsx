import * as React from 'react'
import {
  EditorTheme,
  EditorDefaultMode,
  EditorModeLock,
  IEditorSettings,
} from '../../models/preferences'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IEditorPreferencesProps {
  readonly editorSettings: IEditorSettings
  readonly onEditorSettingsChanged: (settings: IEditorSettings) => void
}

const themeLabels: Record<EditorTheme, string> = {
  [EditorTheme.GitHubDark]: 'GitHub Dark',
  [EditorTheme.GitHubLight]: 'GitHub Light',
  [EditorTheme.Monokai]: 'Monokai',
  [EditorTheme.Dracula]: 'Dracula',
  [EditorTheme.OneDark]: 'One Dark',
  [EditorTheme.SolarizedDark]: 'Solarized Dark',
  [EditorTheme.SolarizedLight]: 'Solarized Light',
  [EditorTheme.Nord]: 'Nord',
}

const defaultModeLabels: Record<EditorDefaultMode, string> = {
  [EditorDefaultMode.ReadOnly]: 'Read-only',
  [EditorDefaultMode.Edit]: 'Edit',
}

const modeLockLabels: Record<EditorModeLock, string> = {
  [EditorModeLock.None]: 'None (allow switching)',
  [EditorModeLock.ReadOnly]: 'Lock to read-only',
  [EditorModeLock.Edit]: 'Lock to edit mode',
}

const fontFamilyOptions = [
  { value: 'var(--font-family-monospace)', label: 'System Monospace' },
  { value: "'SF Mono', monospace", label: 'SF Mono' },
  { value: "'Menlo', monospace", label: 'Menlo' },
  { value: "'Monaco', monospace", label: 'Monaco' },
  { value: "'Consolas', monospace", label: 'Consolas' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: "'Source Code Pro', monospace", label: 'Source Code Pro' },
]

const fontSizeOptions = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24]
const tabSizeOptions = [2, 4, 8]
const lineHeightOptions = [
  { value: 1.2, label: 'Compact (1.2)' },
  { value: 1.4, label: 'Normal (1.4)' },
  { value: 1.5, label: 'Relaxed (1.5)' },
  { value: 1.6, label: 'Spacious (1.6)' },
  { value: 1.8, label: 'Extra Spacious (1.8)' },
]

const autoSaveOptions = [
  { value: 0, label: 'Disabled' },
  { value: 500, label: '0.5 seconds' },
  { value: 1000, label: '1 second' },
  { value: 1500, label: '1.5 seconds' },
  { value: 2000, label: '2 seconds' },
  { value: 3000, label: '3 seconds' },
  { value: 5000, label: '5 seconds' },
]

/** Editor preferences panel */
export class Editor extends React.Component<IEditorPreferencesProps> {
  private updateSetting = <K extends keyof IEditorSettings>(
    key: K,
    value: IEditorSettings[K]
  ) => {
    this.props.onEditorSettingsChanged({
      ...this.props.editorSettings,
      [key]: value,
    })
  }

  private onThemeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('theme', event.currentTarget.value as EditorTheme)
  }

  private onFontSizeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('fontSize', parseInt(event.currentTarget.value, 10))
  }

  private onFontFamilyChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('fontFamily', event.currentTarget.value)
  }

  private onLineHeightChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('lineHeight', parseFloat(event.currentTarget.value))
  }

  private onTabSizeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('tabSize', parseInt(event.currentTarget.value, 10))
  }

  private onDefaultModeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('defaultMode', event.currentTarget.value as EditorDefaultMode)
  }

  private onModeLockChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('modeLock', event.currentTarget.value as EditorModeLock)
  }

  private onAutoSaveDelayChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.updateSetting('autoSaveDelay', parseInt(event.currentTarget.value, 10))
  }

  private onShowLineNumbersChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('showLineNumbers', event.currentTarget.checked)
  }

  private onShowFoldGuttersChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('showFoldGutters', event.currentTarget.checked)
  }

  private onInsertSpacesChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('insertSpaces', event.currentTarget.checked)
  }

  private onWordWrapChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('wordWrap', event.currentTarget.checked)
  }

  private onHighlightActiveLineChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('highlightActiveLine', event.currentTarget.checked)
  }

  private onBracketMatchingChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('bracketMatching', event.currentTarget.checked)
  }

  private onAutoCloseBracketsChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('autoCloseBrackets', event.currentTarget.checked)
  }

  private onEnableSearchChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSetting('enableSearch', event.currentTarget.checked)
  }

  public render() {
    const { editorSettings } = this.props

    return (
      <div className="editor-preferences">
        <h2>Code Editor</h2>
        <p className="preferences-description">
          Configure the appearance and behavior of the code editor.
        </p>

        <div className="preferences-section">
          <h3>Appearance</h3>

          <Row>
            <Select
              label="Color Theme"
              value={editorSettings.theme}
              onChange={this.onThemeChanged}
            >
              {Object.entries(themeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Row>

          <Row>
            <Select
              label="Font Size"
              value={editorSettings.fontSize.toString()}
              onChange={this.onFontSizeChanged}
            >
              {fontSizeOptions.map(size => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </Select>
          </Row>

          <Row>
            <Select
              label="Font Family"
              value={editorSettings.fontFamily}
              onChange={this.onFontFamilyChanged}
            >
              {fontFamilyOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Row>

          <Row>
            <Select
              label="Line Height"
              value={editorSettings.lineHeight.toString()}
              onChange={this.onLineHeightChanged}
            >
              {lineHeightOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Row>

          <Row>
            <Checkbox
              label="Show line numbers"
              value={editorSettings.showLineNumbers ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onShowLineNumbersChanged}
            />
          </Row>

          <Row>
            <Checkbox
              label="Show fold gutters"
              value={editorSettings.showFoldGutters ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onShowFoldGuttersChanged}
            />
          </Row>

          <Row>
            <Checkbox
              label="Highlight active line"
              value={editorSettings.highlightActiveLine ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onHighlightActiveLineChanged}
            />
          </Row>
        </div>

        <div className="preferences-section">
          <h3>Behavior</h3>

          <Row>
            <Select
              label="Default Mode"
              value={editorSettings.defaultMode}
              onChange={this.onDefaultModeChanged}
            >
              {Object.entries(defaultModeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Row>

          <Row>
            <Select
              label="Mode Lock"
              value={editorSettings.modeLock}
              onChange={this.onModeLockChanged}
            >
              {Object.entries(modeLockLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Row>

          <Row>
            <Select
              label="Tab Size"
              value={editorSettings.tabSize.toString()}
              onChange={this.onTabSizeChanged}
            >
              {tabSizeOptions.map(size => (
                <option key={size} value={size}>
                  {size} spaces
                </option>
              ))}
            </Select>
          </Row>

          <Row>
            <Checkbox
              label="Insert spaces instead of tabs"
              value={editorSettings.insertSpaces ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onInsertSpacesChanged}
            />
          </Row>

          <Row>
            <Checkbox
              label="Word wrap"
              value={editorSettings.wordWrap ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onWordWrapChanged}
            />
          </Row>

          <Row>
            <Select
              label="Auto-save Delay"
              value={editorSettings.autoSaveDelay.toString()}
              onChange={this.onAutoSaveDelayChanged}
            >
              {autoSaveOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Row>
        </div>

        <div className="preferences-section">
          <h3>Editor Features</h3>

          <Row>
            <Checkbox
              label="Bracket matching"
              value={editorSettings.bracketMatching ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onBracketMatchingChanged}
            />
          </Row>

          <Row>
            <Checkbox
              label="Auto-close brackets"
              value={editorSettings.autoCloseBrackets ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onAutoCloseBracketsChanged}
            />
          </Row>

          <Row>
            <Checkbox
              label="Enable search (Cmd/Ctrl+F)"
              value={editorSettings.enableSearch ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onEnableSearchChanged}
            />
          </Row>
        </div>
      </div>
    )
  }
}
