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
import { fatalError } from '../../lib/fatal-error'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly automaticallySwitchTheme: boolean
  readonly onAutomaticallySwitchThemeChanged: (checked: boolean) => void
}

const themes: ReadonlyArray<ISegmentedItem> = [
  { title: 'Light', description: 'The default theme of GitHub Desktop' },
  {
    title: 'Dark (beta)',
    description:
      'A beta version of our dark theme. Still under development. Please report any issues you may find to our issue tracker.',
  },
]

export class Appearance extends React.Component<IAppearanceProps, {}> {
  private onSelectedThemeChanged = (index: number) => {
    if (index === 0) {
      this.props.onSelectedThemeChanged(ApplicationTheme.Light)
    } else if (index === 1) {
      this.props.onSelectedThemeChanged(ApplicationTheme.Dark)
    } else {
      fatalError(`Unknown theme index ${index}`)
    }
    this.props.onAutomaticallySwitchThemeChanged(false)
  }

  private onAutomaticallySwitchThemeChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    if (value) {
      this.onSelectedThemeChanged(isDarkModeEnabled() ? 1 : 0)
    }

    this.props.onAutomaticallySwitchThemeChanged(value)
  }

  public render() {
    return (
      <DialogContent>
        {this.renderThemeOptions()}
        {this.renderAutoSwitcherOption()}
      </DialogContent>
    )
  }

  public renderThemeOptions() {
    const selectedIndex =
      this.props.selectedTheme === ApplicationTheme.Dark ? 1 : 0

    return (
      <Row>
        <VerticalSegmentedControl
          items={themes}
          selectedIndex={selectedIndex}
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
}
