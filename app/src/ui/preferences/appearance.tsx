import * as React from 'react'
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

interface IAppearanceState {
  readonly automaticallySwitchTheme: boolean
}

const themes: ReadonlyArray<ISegmentedItem> = [
  { title: 'Light', description: 'The default theme of GitHub Desktop' },
  {
    title: 'Dark (beta)',
    description:
      'A beta version of our dark theme. Still under development. Please report any issues you may find to our issue tracker.',
  },
]

export class Appearance extends React.Component<
  IAppearanceProps,
  IAppearanceState
> {
  public constructor(props: IAppearanceProps) {
    super(props)

    this.state = {
      automaticallySwitchTheme: this.props.automaticallySwitchTheme,
    }
  }

  private onSelectedThemeChanged = (index: number) => {
    if (index === 0) {
      this.props.onSelectedThemeChanged(ApplicationTheme.Light)
    } else if (index === 1) {
      this.props.onSelectedThemeChanged(ApplicationTheme.Dark)
    } else {
      fatalError(`Unknown theme index ${index}`)
    }
  }

  private onAutomaticallySwitchThemeChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ automaticallySwitchTheme: value })
    this.props.onAutomaticallySwitchThemeChanged(value)
  }

  public render() {
    const selectedIndex =
      this.props.selectedTheme === ApplicationTheme.Dark ? 1 : 0

    return __DARWIN__ ? (
      <DialogContent>
        <Row>
          <VerticalSegmentedControl
            items={themes}
            selectedIndex={selectedIndex}
            onSelectionChanged={this.onSelectedThemeChanged}
          />
        </Row>
        <Row>
          <Checkbox
            label="Automatically switch theme to match system theme."
            value={
              this.state.automaticallySwitchTheme
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onAutomaticallySwitchThemeChanged}
          />
        </Row>
      </DialogContent>
    ) : (
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
