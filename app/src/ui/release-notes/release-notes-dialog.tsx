import * as React from 'react'
import * as semver from 'semver'

import { getChangeLog, parseReleaseEntries } from '../../lib/release-notes'

import { updateStore } from '../lib/update-store'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'

import { Dialog, DialogContent, DialogFooter } from '../dialog'

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

    try {
      const releases = await getChangeLog()
      const newReleases = releases.filter(release => semver.gt(release.version, currentVersion))

      let allReleaseEntries: Array<string> = []

      for (const release of newReleases) {
        allReleaseEntries = allReleaseEntries.concat(release.notes)
      }

      const releaseEntries = parseReleaseEntries(allReleaseEntries)
      for (const entry of releaseEntries) {
        log.info(`found entry: ${entry.kind} - ${entry.message}`)
      }

    } catch {
      // TODO: handle error about network
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
