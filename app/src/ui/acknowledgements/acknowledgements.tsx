import * as Path from 'path'
import * as Fs from 'fs'
import * as React from 'react'
import { getAppPath } from '../lib/app-proxy'
import { Loading } from '../lib/loading'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

const RepositoryURL = 'https://github.com/desktop/desktop'
const ElectronURL = 'https://electron.atom.io'
const TypeScriptURL = 'http://www.typescriptlang.org'

interface IAcknowledgementsProps {
  /** The function to call when the dialog should be dismissed. */
  readonly onDismissed: () => void
}

interface ILicense {
  readonly repository?: string
  readonly sourceText?: string
}

type Licenses = { [key: string]: ILicense }

interface IAcknowledgementsState {
  readonly licenses: Licenses | null
}

/** The component which displays the licenses for packages used in the app. */
export class Acknowledgements extends React.Component<IAcknowledgementsProps, IAcknowledgementsState> {
  public constructor(props: IAcknowledgementsProps) {
    super(props)

    this.state = { licenses: null }
  }

  public componentDidMount() {
    const path = Path.join(getAppPath(), 'static', 'licenses.json')
    Fs.readFile(path, 'utf8', (err, data) => {
      if (err) {
        console.error('Error loading licenses')
        console.error(err)
        return
      }

      const parsed = JSON.parse(data)
      if (!parsed) {
        console.error(`Couldn't parse licenses!`)
        return
      }

      this.setState({ licenses: parsed })
    })
  }

  private renderLicenses(licenses: Licenses) {
    const elements = []
    for (const [ index, key ] of Object.keys(licenses).sort().entries()) {
      // The first entry is Desktop itself. We don't need to thank us.
      if (index === 0) { continue }

      const license = licenses[key]
      const repository = license.repository
      let nameElement: JSX.Element
      if (repository) {
        nameElement = (
          <p className='license-name'>
            <LinkButton uri={normalizedGitHubURL(repository)}>{key}</LinkButton>
          </p>
        )
      } else {
        nameElement = <p className='license-name'>{key}</p>
      }

      const licenseText = license.sourceText ? license.sourceText : `License: ${key}`
      elements.push(
        <div key={key}>
          {nameElement}
          <p className='license-text'>{licenseText}</p>
        </div>)
    }

    return elements
  }

  public render() {
    const licenses = this.state.licenses
    return (
      <Dialog
        id='acknowledgements'
        title='Acknowledgements'
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}>
        <DialogContent>
          <p>GitHub Desktop stands on the shoulders of giants! We're <LinkButton uri={RepositoryURL}>open source</LinkButton>, built on <LinkButton uri={ElectronURL}>Electron</LinkButton> and written in <LinkButton uri={TypeScriptURL}>TypeScript</LinkButton>. Check out <LinkButton uri={RepositoryURL}>our repository</LinkButton> for more details.</p>

          <div id='licenses'>
            {licenses ? this.renderLicenses(licenses) : <Loading/>}
          </div>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}

/** Normalize a package URL to a GitHub URL. */
function normalizedGitHubURL(url: string): string {
  let newURL = url
  newURL = newURL.replace('git+https://github.com', 'https://github.com')
  newURL = newURL.replace('git+ssh://git@github.com', 'https://github.com')
  return newURL
}
