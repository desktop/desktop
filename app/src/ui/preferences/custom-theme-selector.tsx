import * as React from 'react'
import { ApplicationTheme, ICustomTheme } from '../lib/application-theme'
import { SketchPicker } from 'react-color'
import { Button } from '../lib/button'

const themeDefaults = {
  [ApplicationTheme.HighContrast]: {
    background: '#23262d',
    toolbarBackground: '#0b0f12',
    text: '#eef1f5',
    hoverItem: '#939daa',
    hoverText: '#fff',
    activeItem: '#3892ff',
    activeText: '#0b0f12',
    border: '#6f7783',
  },
}

interface ICustomThemeSelectorProps {
  readonly selectedTheme: ApplicationTheme
  readonly customTheme?: ICustomTheme
  readonly onCustomThemeChanged: (customTheme: ICustomTheme) => void
}

interface ICustomThemeSelectorState {
  readonly customTheme?: ICustomTheme
  readonly selectedThemeOptionColor: keyof ICustomTheme
  readonly isPopoverOpen: boolean
}

export class CustomThemeSelector extends React.Component<
  ICustomThemeSelectorProps,
  ICustomThemeSelectorState
> {
  public constructor(props: ICustomThemeSelectorProps) {
    super(props)

    const { customTheme: setTheme, selectedTheme } = this.props
    let customTheme =
      selectedTheme !== ApplicationTheme.HighContrast ? undefined : setTheme
    if (
      setTheme === undefined &&
      selectedTheme === ApplicationTheme.HighContrast
    ) {
      customTheme = themeDefaults[selectedTheme]
      this.props.onCustomThemeChanged(customTheme)
    }

    this.state = {
      customTheme,
      isPopoverOpen: false,
      selectedThemeOptionColor: 'background',
    }
  }

  private onThemeChange = (color: { hex: string }) => {
    this.closePopover()
    if (this.state.customTheme === undefined) {
      log.error(
        '[onThemeChange] - customTheme not defined. This should not be possible.'
      )
      return
    }

    this.setState({
      customTheme: {
        ...this.state.customTheme,
        [this.state.selectedThemeOptionColor]: color.hex,
      },
    })
    this.props.onCustomThemeChanged(this.state.customTheme)
  }

  private openPopover = () => {
    if (this.state === null || this.state.isPopoverOpen === true) {
      return
    }

    this.setState({ isPopoverOpen: true })
  }

  private closePopover = () => {
    if (this.state === null || this.state.isPopoverOpen === false) {
      return
    }

    this.setState({ isPopoverOpen: false })
  }

  private onSwatchClick = (selectedThemeOptionColor: keyof ICustomTheme) => {
    return () => {
      this.setState({ selectedThemeOptionColor })
      this.openPopover()
    }
  }

  private onResetToDefaults = () => {
    this.setState({
      customTheme: themeDefaults[ApplicationTheme.HighContrast],
    })
    this.props.onCustomThemeChanged(
      themeDefaults[ApplicationTheme.HighContrast]
    )
  }

  private renderPopover() {
    if (this.state === null || !this.state.isPopoverOpen) {
      return
    }

    if (this.state.customTheme === undefined) {
      log.error(
        '[onThemeChange] - customTheme not defined. This should not be possible.'
      )
      return
    }

    return (
      <div className="color-picker-container">
        <SketchPicker
          color={this.state.customTheme[this.state.selectedThemeOptionColor]}
          onChangeComplete={this.onThemeChange}
        ></SketchPicker>
      </div>
    )
  }

  private renderThemeOptions = () => {
    if (this.state.customTheme === undefined) {
      // not using a customizable theme
      return
    }

    const themePropTitleMap = new Map([
      ['background', 'Background'],
      ['text', 'Text'],
      ['activeItem', 'Active/Action Item'],
      ['activeText', 'Active/Action Item Text'],
      ['hoverItem', 'Item Hover'],
      ['hoverText', 'Item Hover Text'],
      ['border', 'Border'],
    ])

    return Object.entries(this.state.customTheme).map(([key, value], i) => {
      const keyTyped = key as keyof ICustomTheme
      return (
        <div key={i}>
          <span
            className="theme-option-swatch"
            onClick={this.onSwatchClick(keyTyped)}
            style={{
              backgroundColor: value,
            }}
          ></span>
          {' -  '}
          {themePropTitleMap.get(key)}
        </div>
      )
    })
  }

  public render() {
    return (
      <>
        <div>{this.renderThemeOptions()}</div>
        {this.renderPopover()}
        <div>
          <Button onClick={this.onResetToDefaults}>Reset To Defaults</Button>
        </div>
      </>
    )
  }
}
