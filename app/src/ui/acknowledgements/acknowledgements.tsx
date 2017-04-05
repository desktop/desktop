import * as Path from 'path'
import * as Fs from 'fs'
import * as React from 'react'
import { getAppPath } from '../lib/app-proxy'
import { Loading } from '../lib/loading'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IAcknowledgementsProps {
  readonly onDismissed: () => void
}

interface ILicense {
  readonly repository?: string
  readonly license: string
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
    for (const key in licenses) {
      const license = licenses[key]
      const url = license.repository
      let content
      if (url && url.length) {
        content = <LinkButton uri={url}>{key}: {license.license}</LinkButton>
      } else {
        content = <span>{key}: {license.license}</span>
      }

      elements.push(
        <div key={key}>
          {content}
        </div>
      )
    }

    return elements
  }

  public render() {
    const licenses = this.state.licenses
    return (
      <Dialog
        id='licenses'
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}>
        <DialogContent>
          {licenses ? this.renderLicenses(licenses) : <Loading/>}
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
