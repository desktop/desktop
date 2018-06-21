import * as React from 'react'
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
  }

  public render() {
    const selectedIndex =
      this.props.selectedTheme === ApplicationTheme.Dark ? 1 : 0

    return (
      <DialogContent>
        <VerticalSegmentedControl
          items={themes}
          selectedIndex={selectedIndex}
          onSelectionChanged={this.onSelectedThemeChanged}
        />
      </DialogContent>
    )
  }
}
