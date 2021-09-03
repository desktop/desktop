import * as React from 'react'
import { ApplicationTheme, ICustomTheme } from '../lib/application-theme'
import { SketchPicker } from 'react-color'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import { enableCustomizeTheme } from '../../lib/feature-flag'
import { CustomThemeDefaults } from '../lib/custom-theme'

interface ICustomThemeSelectorProps {
  readonly selectedTheme: ApplicationTheme
  readonly customTheme?: ICustomTheme
  readonly onCustomThemeChanged: (customTheme: ICustomTheme) => void
}

interface ICustomThemeSelectorState {
  readonly customTheme?: ICustomTheme
  readonly selectedThemeOptionColor: keyof ICustomTheme
  readonly isPopoverOpen: boolean
  readonly popoverBottom: string
  readonly popoverLeft: string
}

export class CustomThemeSelector extends React.Component<
  ICustomThemeSelectorProps,
  ICustomThemeSelectorState
> {
  public constructor(props: ICustomThemeSelectorProps) {
    super(props)

    this.state = {
      customTheme: this.getDefaultCustomTheme(),
      isPopoverOpen: false,
      selectedThemeOptionColor: 'background',
      popoverBottom: '500px',
      popoverLeft: '275px',
    }
  }

  private isCustom = (): boolean => {
    return (
      this.props.selectedTheme === ApplicationTheme.HighContrast &&
      enableCustomizeTheme()
    )
  }

  private getDefaultCustomTheme = (): ICustomTheme => {
    const { customTheme } = this.props
    const defaultTheme =
      customTheme === undefined
        ? CustomThemeDefaults[ApplicationTheme.HighContrast]
        : customTheme

    if (customTheme === undefined) {
      this.props.onCustomThemeChanged(defaultTheme)
    }

    return defaultTheme
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
    return (event: any) => {
      const popoverBottom = `${event.currentTarget.offsetTop - 300}px`
      const popoverLeft = `${event.currentTarget.offsetLeft + 50}px`
      this.setState({ selectedThemeOptionColor, popoverBottom, popoverLeft })
      this.openPopover()
    }
  }

  private onResetToDefaults = () => {
    this.setState({
      customTheme: CustomThemeDefaults[ApplicationTheme.HighContrast],
    })
    this.props.onCustomThemeChanged(
      CustomThemeDefaults[ApplicationTheme.HighContrast]
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

    const styles = {
      bottom: this.state.popoverBottom,
      left: this.state.popoverLeft,
    }

    return (
      <div className="color-picker-container" style={styles}>
        <SketchPicker
          color={this.state.customTheme[this.state.selectedThemeOptionColor]}
          onChangeComplete={this.onThemeChange}
        ></SketchPicker>
      </div>
    )
  }

  private renderThemeOptions = () => {
    const customTheme =
      this.state.customTheme === undefined
        ? this.getDefaultCustomTheme()
        : this.state.customTheme

    const themePropTitleMap = new Map([
      ['background', 'Background'],
      ['border', 'Border'],
      ['text', 'Text'],
      ['activeItem', 'Active'],
      ['activeText', 'Active Text'],
    ])

    return Object.entries(customTheme).map(([key, value], i) => {
      const keyTyped = key as keyof ICustomTheme
      return (
        <div key={i} className="swatch-box">
          <div
            className="theme-option-swatch"
            onClick={this.onSwatchClick(keyTyped)}
            style={{
              backgroundColor: value,
            }}
          ></div>
          <div className="theme-option-title">{themePropTitleMap.get(key)}</div>
        </div>
      )
    })
  }

  public render() {
    if (!this.isCustom()) {
      return null
    }

    return (
      <div className="custom-theme-selector">
        <div className="custom-theme-selecter-header">
          <h2>Customize:</h2>
          <Button
            onClick={this.onResetToDefaults}
            tooltip="Reset to High Contrast defaults"
          >
            <Octicon symbol={syncClockwise} />
          </Button>
        </div>
        <div className="swatch-options">{this.renderThemeOptions()}</div>
        {this.renderPopover()}
      </div>
    )
  }
}
