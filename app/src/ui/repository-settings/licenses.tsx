import * as React from 'react'
import { ILicense, getLicenses } from '../add-repository/licenses'
import { Select } from '../lib/select'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Ref } from '../lib/ref'
/** The sentinel value used to indicate no license template has been selected. */
const NoLicenseValue: ILicense = {
  name: 'None',
  featured: false,
  body: '',
  hidden: false,
}

interface ILicenseProps 
{
  readonly text: string | null 
  readonly onLicenseChanged: (license: ILicense) => void
    readonly onShowExamples: () => void
  }

interface ILicenseState {
  /** The names of the available license templates. */
  readonly licenses: ReadonlyArray<ILicense> | null

  /** The license template the user has selected */
  readonly license: string

  /** Whether or not the component was *initialized* with an license. */
  readonly noLicense: boolean
}



/** A view for creating or modifying the repository's license file */
export class License extends React.Component<ILicenseProps,ILicenseState>
{
  public constructor(props: ILicenseProps)
  {
    super(props)
    
    this.state = {
      licenses: null,
      license: NoLicenseValue.name,
      noLicense: this.props.text === null || this.props.text.trim() === ''
    }
  }

  public async componentDidMount()
  {
    const licenses = await getLicenses()

    this.setState({ licenses });
  }

  private onLicenseChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const licenseName = event.currentTarget.value
    if (licenseName === NoLicenseValue.name)
    {
      this.props.onLicenseChanged(NoLicenseValue);
      }
    else 
    {
      const license = (this.state.licenses || []).find(x => x.name === licenseName) || NoLicenseValue;
      this.props.onLicenseChanged(license);
    }
    this.setState({ license: licenseName })
  }

  private renderLicenses() {
   // Only show template selection UI if the user has no license.
    if (!this.state.noLicense) {
      return (<p>Active license : {this.props.text}</p>)
    }

    const licenses = this.state.licenses || []
    const featuredLicenses = [
      NoLicenseValue,
      ...licenses.filter(l => l.featured),
    ]
    const nonFeaturedLicenses = licenses.filter(l => !l.featured)

    return (
      <Row>
        <Select
          label="License"
          value={this.state.license}
          onChange={this.onLicenseChange}
        >
          {featuredLicenses.map(l => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
          <option disabled={true}>────────────────────</option>
          {nonFeaturedLicenses.map(l => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </Select>
      </Row>
    )
  }

  public render(){
        return (
      <DialogContent>
        <p>
          Editing <Ref>LICENSE</Ref>. This file specifies intentionally
          what users can and cannot do with your code.{' '}
          <LinkButton onClick={this.props.onShowExamples}>
            Learn more
          </LinkButton>
        </p>

        {this.renderLicenses()}
      </DialogContent>)
  }


}
