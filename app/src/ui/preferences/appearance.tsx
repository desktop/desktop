import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from '../lib/application-theme'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import {
  VerticalSegmentedControl,
  ISegmentedItem,
} from '../lib/vertical-segmented-control'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
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
  ...(supportsSystemThemeChanges() ? [systemTheme] : []),
]

export class Appearance extends React.Component<IAppearanceProps, {}> {
  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
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
      </DialogContent>
    )
  }
}
