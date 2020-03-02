import * as React from 'react'
import { Ref } from './ref'
import { LinkButton } from './link-button'
import { unlink } from 'fs-extra'

interface IConfigLockFileExistsProps {
  /**
   * The path to the lock file that's preventing a configuration
   * file update.
   */
  readonly lockFilePath: string

  /**
   * Called when the lock file has been deleted and the configuration
   * update can be retried
   */
  readonly onLockFileDeleted: () => void

  /**
   * Called if the lock file couldn't be deleted
   */
  readonly onError: (e: Error) => void
}

export class ConfigLockFileExists extends React.Component<
  IConfigLockFileExistsProps
> {
  private onDeleteLockFile = async () => {
    try {
      await unlink(this.props.lockFilePath)
    } catch (e) {
      // We don't care about failure to unlink due to the
      // lock file not existing any more
      if (e.code !== 'ENOENT') {
        this.props.onError(e)
        return
      }
    }

    this.props.onLockFileDeleted()
  }
  public render() {
    return (
      <div className="config-lock-file-exists-component">
        <p>
          Failed to update Git configuration file. A lock file already exists at{' '}
          <Ref>{this.props.lockFilePath}</Ref>.
        </p>
        <p>
          This can happen if another tool is currently modifying the Git
          configuration or if a Git process has terminated earlier without
          cleaning up the lock file. Do you want to{' '}
          <LinkButton onClick={this.onDeleteLockFile}>
            delete the lock file
          </LinkButton>{' '}
          and try again?
        </p>
      </div>
    )
  }
}
