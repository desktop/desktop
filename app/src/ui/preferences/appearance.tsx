import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
  ICustomTheme,
} from '../lib/application-theme'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import {
  VerticalSegmentedControl,
  ISegmentedItem,
} from '../lib/vertical-segmented-control'
import { CustomThemeSelector } from './custom-theme-selector'
import { enableHighContrastTheme } from '../../lib/feature-flag'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly customTheme?: ICustomTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly onCustomThemeChanged: (theme: ICustomTheme) => void
}

const systemTheme: ISegmentedItem<ApplicationTheme> = {
  title: 'System',
  description: 'Automatically switch theme to match system theme.',
  key: ApplicationTheme.System,
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
  ...(enableHighContrastTheme()
    ? [
        {
          title: 'High Contrast',
          description: 'Customizable High Contrast Theme',
          key: ApplicationTheme.HighContrast,
        },
      ]
    : []),
  ...(supportsSystemThemeChanges() ? [systemTheme] : []),
]

export class Appearance extends React.Component<IAppearanceProps, {}> {
  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
  }

  private onCustomThemeChanged = (theme: ICustomTheme) => {
    this.props.onCustomThemeChanged(theme)
  }

  public render() {
    let selectedTheme = this.props.selectedTheme

    if (
      this.props.selectedTheme === ApplicationTheme.System &&
      !supportsSystemThemeChanges()
    ) {
      selectedTheme = getCurrentlyAppliedTheme()
    }

    return (
      <DialogContent>
        <Row>
          <VerticalSegmentedControl
            items={themes}
            selectedKey={selectedTheme}
            onSelectionChanged={this.onSelectedThemeChanged}
          />
        </Row>
        <Row>
          <CustomThemeSelector
            onCustomThemeChanged={this.onCustomThemeChanged}
            selectedTheme={selectedTheme}
            customTheme={this.props.customTheme}
          />
        </Row>
      </DialogContent>
    )
  }
}
