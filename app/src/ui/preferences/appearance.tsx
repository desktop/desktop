import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from '../lib/application-theme'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { RadioGroup } from '../lib/radio-group'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { encodePathAsUrl } from '../../lib/path'
import { tabSizeDefault } from '../../lib/stores/app-store'
import {
  clampDiffFontSize,
  defaultDiffFontLigatures,
  defaultDiffFontSize,
  defaultDiffFontWeight,
  normalizeDiffFontFamily,
  normalizeDiffFontLigatures,
  normalizeDiffFontWeight,
} from '../../models/diff-font'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly selectedTabSize: number
  readonly onSelectedTabSizeChanged: (tabSize: number) => void
  readonly selectedDiffFontSize: number
  readonly onSelectedDiffFontSizeChanged: (diffFontSize: number) => void
  readonly selectedDiffFontFamily: string
  readonly onSelectedDiffFontFamilyChanged: (diffFontFamily: string) => void
  readonly selectedDiffFontWeight: string
  readonly onSelectedDiffFontWeightChanged: (diffFontWeight: string) => void
  readonly selectedDiffFontLigatures: string
  readonly onSelectedDiffFontLigaturesChanged: (
    diffFontLigatures: string
  ) => void  
}

interface IAppearanceState {
  readonly selectedTheme: ApplicationTheme | null
  readonly selectedTabSize: number
  readonly selectedDiffFontSize: string
  readonly selectedDiffFontFamily: string
  readonly selectedDiffFontWeight: string
  readonly selectedDiffFontLigatures: string
}

export class Appearance extends React.Component<
  IAppearanceProps,
  IAppearanceState
> {
  public constructor(props: IAppearanceProps) {
    super(props)

    const usePropTheme =
      props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    this.state = {
      selectedTheme: usePropTheme ? props.selectedTheme : null,
      selectedTabSize: props.selectedTabSize,
      selectedDiffFontSize: props.selectedDiffFontSize.toString(),
      selectedDiffFontFamily: props.selectedDiffFontFamily,
      selectedDiffFontWeight: props.selectedDiffFontWeight,
      selectedDiffFontLigatures: props.selectedDiffFontLigatures,
    }

    if (!usePropTheme) {
      this.initializeSelectedTheme()
    }
  }

  public async componentDidUpdate(prevProps: IAppearanceProps) {
    if (
      prevProps === this.props &&
      prevProps.selectedDiffFontSize === this.props.selectedDiffFontSize &&
      prevProps.selectedDiffFontFamily === this.props.selectedDiffFontFamily &&
      prevProps.selectedDiffFontWeight === this.props.selectedDiffFontWeight &&
      prevProps.selectedDiffFontLigatures === this.props.selectedDiffFontLigatures
    ) {
      return
    }

    const usePropTheme =
      this.props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    const selectedTheme = usePropTheme
      ? this.props.selectedTheme
      : await getCurrentlyAppliedTheme()

    const selectedTabSize = this.props.selectedTabSize
    const selectedDiffFontSize = this.props.selectedDiffFontSize.toString()
    const selectedDiffFontFamily = this.props.selectedDiffFontFamily
    const selectedDiffFontWeight = this.props.selectedDiffFontWeight
    const selectedDiffFontLigatures = this.props.selectedDiffFontLigatures

    this.setState({ selectedTheme, selectedTabSize, selectedDiffFontSize, selectedDiffFontFamily, selectedDiffFontWeight, selectedDiffFontLigatures,})
  }

  private initializeSelectedTheme = async () => {
    const selectedTheme = await getCurrentlyAppliedTheme()
    const selectedTabSize = this.props.selectedTabSize
    this.setState({ selectedTheme, selectedTabSize, selectedDiffFontSize: this.props.selectedDiffFontSize.toString(), selectedDiffFontFamily: this.props.selectedDiffFontFamily, selectedDiffFontWeight: this.props.selectedDiffFontWeight, selectedDiffFontLigatures: this.props.selectedDiffFontLigatures, })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
  }

  private onSelectedTabSizeChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedTabSizeChanged(parseInt(event.currentTarget.value))
  }

  private onSelectedDiffFontSizeChanged = (value: string) => {
    this.setState({ selectedDiffFontSize: value })
  }

  private commitSelectedDiffFontSize = (value: string) => {
    const diffFontSize = clampDiffFontSize(parseInt(value, 10))
    this.setState({ selectedDiffFontSize: diffFontSize.toString() })
    this.props.onSelectedDiffFontSizeChanged(diffFontSize)
  }

  private onSelectedDiffFontFamilyChanged = (value: string) => {
    this.setState({ selectedDiffFontFamily: value })
  }

  private commitSelectedDiffFontFamily = (value: string) => {
    const diffFontFamily = normalizeDiffFontFamily(value)
    this.setState({ selectedDiffFontFamily: diffFontFamily })
    this.props.onSelectedDiffFontFamilyChanged(diffFontFamily)
  }

  private onSelectedDiffFontWeightChanged = (value: string) => {
    this.setState({ selectedDiffFontWeight: value })
  }

  private commitSelectedDiffFontWeight = (value: string) => {
    const diffFontWeight =
      value.trim().length === 0 ? '' : normalizeDiffFontWeight(value)
    this.setState({ selectedDiffFontWeight: diffFontWeight })
    this.props.onSelectedDiffFontWeightChanged(diffFontWeight)
  }

  private onSelectedDiffFontLigaturesChanged = (value: string) => {
    this.setState({ selectedDiffFontLigatures: value })
  }

  private commitSelectedDiffFontLigatures = (value: string) => {
    const diffFontLigatures =
      value.trim().length === 0 ? '' : normalizeDiffFontLigatures(value)
    this.setState({ selectedDiffFontLigatures: diffFontLigatures })
    this.props.onSelectedDiffFontLigaturesChanged(diffFontLigatures)
  }

  public renderThemeSwatch = (theme: ApplicationTheme) => {
    const darkThemeImage = encodePathAsUrl(__dirname, 'static/ghd_dark.svg')
    const lightThemeImage = encodePathAsUrl(__dirname, 'static/ghd_light.svg')

    switch (theme) {
      case ApplicationTheme.Light:
        return (
          <span>
            <img src={lightThemeImage} alt="" />
            <span className="theme-value-label">Light</span>
          </span>
        )
      case ApplicationTheme.Dark:
        return (
          <span>
            <img src={darkThemeImage} alt="" />
            <span className="theme-value-label">Dark</span>
          </span>
        )
      case ApplicationTheme.System:
        /** Why three images? The system theme swatch uses the first image
         * positioned relatively to get the label container size and uses the
         * second and third positioned absolutely over first and third one
         * clipped in half to render a split dark and light theme swatch. */
        return (
          <span>
            <span className="system-theme-swatch">
              <img src={lightThemeImage} alt="" />
              <img src={lightThemeImage} alt="" />
              <img src={darkThemeImage} alt="" />
            </span>
            <span className="theme-value-label">System</span>
          </span>
        )
    }
  }

  private renderSelectedTheme() {
    const selectedTheme = this.state.selectedTheme

    if (selectedTheme == null) {
      return <Row>Loading system theme</Row>
    }

    const themes = [
      ApplicationTheme.Light,
      ApplicationTheme.Dark,
      ...(supportsSystemThemeChanges() ? [ApplicationTheme.System] : []),
    ]

    return (
      <div className="appearance-section">
        <h2 id="theme-heading">Theme</h2>

        <RadioGroup<ApplicationTheme>
          ariaLabelledBy="theme-heading"
          className="theme-selector"
          selectedKey={selectedTheme}
          radioButtonKeys={themes}
          onSelectionChanged={this.onSelectedThemeChanged}
          renderRadioButtonLabelContents={this.renderThemeSwatch}
        />
      </div>
    )
  }

  private renderDiffSettings() {
    const availableTabSizes: number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12]

    return (
      <div className="appearance-section">
        <h2 id="diff-heading">{'Diff'}</h2>

        <TextBox
          label={__DARWIN__ ? 'Font Size' : 'Font size'}
          value={this.state.selectedDiffFontSize}
          placeholder={defaultDiffFontSize.toString()}
          onValueChanged={this.onSelectedDiffFontSizeChanged}
          onBlur={this.commitSelectedDiffFontSize}
          onEnterPressed={this.commitSelectedDiffFontSize}
        />

        <TextBox
          value={this.state.selectedDiffFontFamily}
          label="Font"
          placeholder="Default monospace stack"
          onValueChanged={this.onSelectedDiffFontFamilyChanged}
          onBlur={this.commitSelectedDiffFontFamily}
          onEnterPressed={this.commitSelectedDiffFontFamily}
        />

        <TextBox
          value={this.state.selectedDiffFontWeight}
          label={__DARWIN__ ? 'Font Weight' : 'Font weight'}
          placeholder={`${defaultDiffFontWeight}`}
          onValueChanged={this.onSelectedDiffFontWeightChanged}
          onBlur={this.commitSelectedDiffFontWeight}
          onEnterPressed={this.commitSelectedDiffFontWeight}
        />

        <TextBox
          value={this.state.selectedDiffFontLigatures}
          label={__DARWIN__ ? 'Font Ligatures' : 'Font ligatures'}
          placeholder={`${defaultDiffFontLigatures}`}
          onValueChanged={this.onSelectedDiffFontLigaturesChanged}
          onBlur={this.commitSelectedDiffFontLigatures}
          onEnterPressed={this.commitSelectedDiffFontLigatures}
        />

        <Select
          value={this.state.selectedTabSize.toString()}
          label={__DARWIN__ ? 'Tab Size' : 'Tab size'}
          onChange={this.onSelectedTabSizeChanged}
        >
          {availableTabSizes.map(n => (
            <option key={n} value={n}>
              {n === tabSizeDefault ? `${n} (default)` : n}
            </option>
          ))}
        </Select>
      </div>
    )
  }

  public render() {
    return (
      <DialogContent>
        {this.renderSelectedTheme()}
        {this.renderDiffSettings()}
      </DialogContent>
    )
  }
}
