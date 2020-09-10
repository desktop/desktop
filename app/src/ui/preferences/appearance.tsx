import * as React from 'react'
import { supportsDarkMode, isDarkModeEnabled } from '../lib/dark-theme'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import {
  VerticalSegmentedControl,
  ISegmentedItem,
} from '../lib/vertical-segmented-control'
import { ApplicationTheme } from '../lib/application-theme'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly automaticallySwitchTheme: boolean
  readonly onAutomaticallySwitchThemeChanged: (checked: boolean) => void
  readonly displayFullscreenInfoToast: boolean
  readonly onDisplayFullscreenInfoToastChanged: (checked: boolean) => void
}

const themes: ReadonlyArray<ISegmentedItem<ApplicationTheme>> = [
  {
    title: 'Light',
    description: 'The default theme of GitHub Desktop',
    key: ApplicationTheme.Light,
  },
  {
    title: 'Dark',
    description: 'GitHub Desktop is for you too, creatures of the night',
    key: ApplicationTheme.Dark,
  },
]

export class Appearance extends React.Component<IAppearanceProps, {}> {
  private onSelectedThemeChanged = (value: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(value)
    this.props.onAutomaticallySwitchThemeChanged(false)
  }

  private onAutomaticallySwitchThemeChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    if (value) {
      this.onSelectedThemeChanged(
        isDarkModeEnabled() ? ApplicationTheme.Dark : ApplicationTheme.Light
      )
    }

    this.props.onAutomaticallySwitchThemeChanged(value)
  }

  private onDisplayFullscreenInfoToastChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.props.onDisplayFullscreenInfoToastChanged(value)
  }

  public render() {
    return (
      <DialogContent>
        {this.renderThemeOptions()}
        {this.renderAutoSwitcherOption()}
        {this.renderShowFullscreenInfoToastOption()}
      </DialogContent>
    )
  }

  public renderThemeOptions() {
    return (
      <Row>
        <VerticalSegmentedControl
          items={themes}
          selectedKey={this.props.selectedTheme}
          onSelectionChanged={this.onSelectedThemeChanged}
        />
      </Row>
    )
  }

  public renderAutoSwitcherOption() {
    if (!supportsDarkMode()) {
      return null
    }

    return (
      <Row>
        <Checkbox
          label="Automatically switch theme to match system theme."
          value={
            this.props.automaticallySwitchTheme
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onAutomaticallySwitchThemeChanged}
        />
      </Row>
    )
  }

  public renderShowFullscreenInfoToastOption() {
    return (
      <Row>
        <Checkbox
          label="Display exit shortcut when entering fullscreen."
          value={
            this.props.displayFullscreenInfoToast
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onDisplayFullscreenInfoToastChanged}
        />
      </Row>
    )
  }
}
