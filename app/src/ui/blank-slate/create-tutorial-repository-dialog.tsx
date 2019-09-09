import * as React from 'react'
import * as URL from 'url'
import * as Path from 'path'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Account } from '../../models/account'
import {
  getDotComAPIEndpoint,
  getHTMLURL,
  API,
  IAPIRepository,
} from '../../lib/api'
import { Ref } from '../lib/ref'
import { LinkButton } from '../lib/link-button'
import { getDefaultDir } from '../lib/default-dir'
import { writeFile, pathExists, ensureDir } from 'fs-extra'
import { git, GitError } from '../../lib/git'
import { envForAuthentication } from '../../lib/git/authentication'

interface ICreateTutorialRepositoryDialogProps {
  /**
   * The GitHub.com, or GitHub Enterprise Server account that will
   * be the owner of the tutorial repository.
   */
  readonly account: Account

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  readonly onTutorialRepositoryCreated: (
    path: string,
    apiRepository: IAPIRepository
  ) => void

  readonly onError: (error: Error) => void
}

interface ICreateTutorialRepositoryDialogState {
  /**
   * Whether or not the dialog is currently in the process of creating
   * the tutorial repository. When true this will render a spinning
   * progress icon in the dialog header (if the dialog has a header) as
   * well as temporarily disable dismissal of the dialog.
   */
  readonly loading?: boolean
}

/** The Create Branch component. */
export class CreateTutorialRepositoryDialog extends React.Component<
  ICreateTutorialRepositoryDialogProps,
  ICreateTutorialRepositoryDialogState
> {
  public constructor(props: ICreateTutorialRepositoryDialogProps) {
    super(props)

    this.state = {}
  }

  private async createAPIRepository(account: Account, name: string) {
    const api = new API(account.endpoint, account.token)

    try {
      return await api.createRepository(
        null,
        name,
        'GitHub Desktop tutorial repository',
        true
      )
    } catch (err) {
      throw new Error(
        'Could not create the tutorial repository. ' +
          'The most likely reason is that you already have a repository named ' +
          `"${name}" on your account at ${friendlyEndpointName(account)}.\n\n` +
          'Please delete the repository and try again.'
      )
    }
  }

  public onSubmit = async () => {
    const { account } = this.props
    this.setState({ loading: true })

    const name = 'desktop-tutorial'

    try {
      const path = Path.resolve(getDefaultDir(), name)

      if (await pathExists(path)) {
        throw new Error(
          `The path ${path} already exists. Please move it ` +
            'out of the way, or remove it, and then try again.'
        )
      }

      const repo = await this.createAPIRepository(account, name)
      await ensureDir(path)
      await git(['init'], path, 'tutorial:init')

      const nl = __WIN32__ ? '\r\n' : '\n'
      await writeFile(
        Path.join(path, 'README.md'),
        `# Welcome to GitHub Desktop!${nl}${nl}` +
          `This is your README. READMEs are where you can communicate ` +
          `what your project is and how to use it.${nl}${nl}` +
          `Make any change to this file, save it, and then head ` +
          `back to GitHub Desktop.${nl}`
      )

      await git(['add', '--', 'README.md'], path, 'tutorial:add')
      await git(
        ['commit', '-m', 'Initial commit', '--', 'README.md'],
        path,
        'tutorial:commit'
      )
      await git(
        ['remote', 'add', 'origin', repo.clone_url],
        path,
        'tutorial:add-remote'
      )
      await git(['push', '-u', 'origin', 'master'], path, 'tutorial:push', {
        env: envForAuthentication(account),
      })

      this.props.onTutorialRepositoryCreated(path, repo)
      this.props.onDismissed()
    } catch (err) {
      if (err instanceof GitError) {
        this.props.onError(err)
      } else {
        this.props.onError(
          new Error(
            `Failed creating the tutorial repository.\n\n${err.message}`
          )
        )
      }
    } finally {
      this.setState({ loading: false })
    }
  }

  public onCancel = () => {
    this.props.onDismissed()
  }

  public render() {
    const { account } = this.props

    return (
      <Dialog
        title="Start tutorial"
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
        dismissable={this.state.loading !== true}
        loading={this.state.loading}
      >
        <DialogContent>
          This will create a repository on your local machine, and push it to
          your account <Ref>@{this.props.account.login}</Ref> on{' '}
          <LinkButton uri={getHTMLURL(account.endpoint)}>
            {friendlyEndpointName(account)}
          </LinkButton>
          .
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Continue</Button>
            <Button onClick={this.onCancel}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}

function friendlyEndpointName(account: Account) {
  return account.endpoint === getDotComAPIEndpoint()
    ? 'GitHub.com'
    : URL.parse(account.endpoint).hostname || account.endpoint
}
