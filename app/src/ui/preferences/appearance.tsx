import * as React from 'react'
//import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import {
  VerticalSegmentedControl,
  ISegmentedItem,
} from '../lib/vertical-segmented-control'

interface IAppearanceProps {}

export class Appearance extends React.Component<IAppearanceProps, {}> {
  private onThemeChanged = (index: number) => {}

  public render() {
    const items: ReadonlyArray<ISegmentedItem> = [
      { title: 'Light', description: 'The default theme of GitHub Desktop' },
      {
        title: 'Dark (beta)',
        description:
          'A beta version of our coming dark theme. Still under development. Please report any issues you may find to our issue tracker.',
      },
    ]

    return (
      <DialogContent>
        <VerticalSegmentedControl
          items={items}
          selectedIndex={0}
          onSelectionChanged={this.onThemeChanged}
        />
      </DialogContent>
    )
  }
}
