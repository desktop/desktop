import * as React from 'react'
import * as semver from 'semver'

import {
  getChangeLog,
  parseReleaseEntries,
  groupEntries,
} from '../../lib/release-notes'

import { updateStore } from '../lib/update-store'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'

import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IReleaseNotesProps {
  readonly onDismissed: () => void
  readonly currentVersion: string
}

interface IReleaseNotesState {
  readonly loading: boolean
  readonly error?: Error
  readonly latestVersion?: string
}

/**
 * The dialog to show with details about the newest release
 */
export class ReleaseNotes extends React.Component<
  IReleaseNotesProps,
  IReleaseNotesState
> {
  public constructor(props: IReleaseNotesProps) {
    super(props)

    this.state = { loading: true }
  }

  public async componentDidMount() {
    const currentVersion = this.props.currentVersion

    try {
      const releases = await getChangeLog()
      const newReleases = releases.filter(release =>
        semver.gt(release.version, currentVersion)
      )

      // TODO: what if we don't have any new releases?
      this.setState({ latestVersion: newReleases[0].version })

      let allReleaseEntries: Array<string> = []

      for (const release of newReleases) {
        allReleaseEntries = allReleaseEntries.concat(release.notes)
      }

      const releaseEntries = parseReleaseEntries(allReleaseEntries)
      for (const entry of releaseEntries) {
        log.info(`found entry: ${entry.kind} - ${entry.message}`)
      }

      const grouped = groupEntries(releaseEntries)

      if (grouped.pretext != null) {
      }
    } catch {
      // TODO: handle error about network
    } finally {
      this.setState({ loading: false })
    }
  }

  private showReleaseContents() {
    return (
      <DialogContent>
        <p>Version {this.state.latestVersion}</p>

        <p>some release notes go here</p>
      </DialogContent>
    )
  }

  private showLoadingIndicator() {
    return (
      <DialogContent>
        <p>fetching release notes</p>
      </DialogContent>
    )
  }

  public render() {
    const content = this.state.loading
      ? this.showLoadingIndicator()
      : this.showReleaseContents()

    return (
      <Dialog id="release-notes" onDismissed={this.props.onDismissed}>
        {content}
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Close</Button>
            <Button onClick={this.updateNow}>
              {__DARWIN__ ? 'Install Now' : 'Install now'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }
}
