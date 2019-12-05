import * as React from 'react'
import * as URL from 'url'
import * as Path from 'path'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
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
import {
  PushProgressParser,
  executionOptionsWithProgress,
} from '../../lib/progress'
import { Progress } from '../../models/progress'
import { Dispatcher } from '../dispatcher'
import { APIError } from '../../lib/http'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface ICreateTutorialRepositoryDialogProps {
  /**
   * The GitHub.com, or GitHub Enterprise Server account that will
   * be the owner of the tutorial repository.
   */
  readonly account: Account

  readonly dispatcher: Dispatcher

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * Event triggered when the tutorial repository has been created
   * locally, initialized with the expected tutorial contents, and
   * pushed to the remote.
   *
   * @param path    The path on the local machine where the tutorial
   *                repository was created
   *
   * @param account The account (and thereby the GitHub host) under
   *                which the repository was created
   *
   * @param apiRepository The repository information as returned by
   *                      the GitHub API as the repository was created.
   */
  readonly onTutorialRepositoryCreated: (
    path: string,
    account: Account,
    apiRepository: IAPIRepository
  ) => Promise<void>

  /**
   * Event triggered when the component encounters an error while
   * attempting to create the tutorial repository. Consumers are
   * intended to display an error message to the end user in response
   * to this event.
   */
  readonly onError: (error: Error) => void
}

interface ICreateTutorialRepositoryDialogState {
  /**
   * Whether or not the dialog is currently in the process of creating
   * the tutorial repository. When true this will render a spinning
   * progress icon in the dialog header (if the dialog has a header) as
   * well as temporarily disable dismissal of the dialog.
   */
  readonly loading: boolean

  /**
   * The current progress in creating the tutorial repository. Undefined
   * until the creation process starts.
   */
  readonly progress?: Progress
}

const nl = __WIN32__ ? '\r\n' : '\n'
const InititalReadmeContents =
  `# Welcome to GitHub Desktop!${nl}${nl}` +
  `This is your README. READMEs are where you can communicate ` +
  `what your project is and how to use it.${nl}${nl}` +
  `Write your name on line 6, save it, and then head ` +
  `back to GitHub Desktop.${nl}`

/**
 * A dialog component reponsible for initializing, publishing, and adding
 * a tutorial repository to the application.
 */
export class CreateTutorialRepositoryDialog extends React.Component<
  ICreateTutorialRepositoryDialogProps,
  ICreateTutorialRepositoryDialogState
> {
  public constructor(props: ICreateTutorialRepositoryDialogProps) {
    super(props)
    this.state = { loading: false }
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
      if (
        err instanceof APIError &&
        err.responseStatus === 422 &&
        err.apiError !== null
      ) {
        if (err.apiError.message === 'Repository creation failed.') {
          if (
            err.apiError.errors &&
            err.apiError.errors.some(
              x => x.message === 'name already exists on this account'
            )
          ) {
            throw new Error(
              'You already have a repository named ' +
                `"${name}" on your account at ${friendlyEndpointName(
                  account
                )}.\n\n` +
                'Please delete the repository and try again.'
            )
          }
        }
      }

      throw err
    }
  }

  private async pushRepo(
    path: string,
    account: Account,
    progressCb: (title: string, value: number, description?: string) => void
  ) {
    const pushTitle = `Pushing repository to ${friendlyEndpointName(account)}`
    progressCb(pushTitle, 0)

    const pushOpts = await executionOptionsWithProgress(
      {
        env: envForAuthentication(account),
      },
      new PushProgressParser(),
      progress => {
        if (progress.kind === 'progress') {
          progressCb(pushTitle, progress.percent, progress.details.text)
        }
      }
    )

    const args = ['push', '-u', 'origin', 'master']
    await git(args, path, 'tutorial:push', pushOpts)
  }

  public onSubmit = async () => {
    this.props.dispatcher.recordTutorialStarted()

    const { account } = this.props
    const endpointName = friendlyEndpointName(account)
    this.setState({ loading: true })

    const name = 'desktop-tutorial'

    try {
      const path = Path.resolve(getDefaultDir(), name)

      if (await pathExists(path)) {
        throw new Error(
          `The path '${path}' already exists. Please move it ` +
            'out of the way, or remove it, and then try again.'
        )
      }

      this.setProgress(`Creating repository on ${endpointName}`, 0)

      const repo = await this.createAPIRepository(account, name)

      this.setProgress('Initializing local repository', 0.2)

      await ensureDir(path)
      await git(['init'], path, 'tutorial:init')

      await writeFile(Path.join(path, 'README.md'), InititalReadmeContents)

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

      await this.pushRepo(path, account, (title, value, description) => {
        this.setProgress(title, 0.3 + value * 0.6, description)
      })

      this.setProgress('Finalizing tutorial repository', 0.9)
      await this.props.onTutorialRepositoryCreated(path, account, repo)
      this.props.dispatcher.recordTutorialRepoCreated()
      this.props.onDismissed()
    } catch (err) {
      this.setState({ loading: false, progress: undefined })

      sendNonFatalException('tutorialRepoCreation', err)

      if (err instanceof GitError) {
        this.props.onError(err)
      } else {
        this.props.onError(
          new Error(
            `Failed creating the tutorial repository.\n\n${err.message}`
          )
        )
      }
    }
  }

  private setProgress(title: string, value: number, description?: string) {
    this.setState({
      progress: { kind: 'generic', title, value, description },
    })
  }

  private renderProgress() {
    if (this.state.progress === undefined) {
      return null
    }

    const { progress } = this.state
    const description = progress.description ? (
      <div className="description">{progress.description}</div>
    ) : null

    return (
      <div className="progress-container">
        <div>{progress.title}</div>
        <progress value={progress.value} />
        {description}
      </div>
    )
  }

  public render() {
    const { account } = this.props

    return (
      <Dialog
        id="create-tutorial-repository-dialog"
        title="Start tutorial"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        dismissable={!this.state.loading}
        loading={this.state.loading}
        disabled={this.state.loading}
      >
        <DialogContent>
          <div>
            This will create a repository on your local machine, and push it to
            your account <Ref>@{this.props.account.login}</Ref> on{' '}
            <LinkButton uri={getHTMLURL(account.endpoint)}>
              {friendlyEndpointName(account)}
            </LinkButton>
            . This repository will only be visible to you, and not visible
            publicly.
          </div>
          {this.renderProgress()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Continue" />
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
