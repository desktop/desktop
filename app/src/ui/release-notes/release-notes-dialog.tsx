import * as React from 'react'
import { updateStore } from '../lib/update-store'
import * as semver from 'semver'

import { ButtonGroup } from '../../ui/lib/button-group'
import { Button } from '../../ui/lib/button'

import { Dialog, DialogContent, DialogFooter } from '../dialog'

type Release = {
  readonly name: string
  readonly notes: ReadonlyArray<string>
  readonly pub_date: string
  readonly version: string
}

interface IReleaseNotesProps {
  readonly onDismissed: () => void
  readonly currentVersion: string
}

interface IReleaseNotesState {
  readonly isLoading: boolean
  readonly isError: boolean
}

/**
 * The dialog to show with details about the newest release
 */
export class ReleaseNotes extends React.Component<IReleaseNotesProps, IReleaseNotesState> {

  constructor(props: IReleaseNotesProps) {
    super(props)

    this.state = { isLoading: true, isError: false }
  }

  public async componentDidMount() {
    const currentVersion = this.props.currentVersion

    const changelog = 'https://central.github.com/deployments/desktop/desktop/changelog.json'
    const query = __RELEASE_CHANNEL__ === 'beta' ? '?env=beta' : ''

    try {
      const response = await fetch(`${changelog}${query}`)
      if (response.ok) {
        const releases: ReadonlyArray<Release> = await response.json()
        const newReleases = releases.filter(release => semver.gt(release.version, currentVersion))

        for (const release of newReleases) {
          console.log(`got release ${release.version}`)
        }

        // TODO: find out which versions should be displayed
        // TODO: set some state
      }
    } catch {
      // TODO TODO: handle error about network
    } finally {
      this.setState({ isLoading: false })
    }
  }

  public render() {
    return (
      <Dialog id="release-notes" onDismissed={this.props.onDismissed}>
        <DialogContent>
          <p>
            some release notes go here
          </p>
          </DialogContent>
          <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Close</Button>
            <Button onClick={this.updateNow}>{ __DARWIN__ ? 'Install Now' : 'Install now'}</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }
}
