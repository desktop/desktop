import { remote } from 'electron'
import * as URL from 'url'
import * as Path from 'path'
import * as React from 'react'
import * as FS from 'fs'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { Row } from '../lib/row'
import { Loading } from '../lib/loading'
import { User } from '../../models/user'
import { Errors } from '../lib/errors'
import { API, getDotComAPIEndpoint, getHTMLURL } from '../../lib/api'
import { parseRemote } from '../../lib/remote-parsing'

/** The name for the error when the destination already exists. */
const DestinationExistsErrorName = 'DestinationExistsError'

interface IRepositoryIdentifier {
  readonly owner: string
  readonly name: string
}

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher

  /** The logged in users. */
  readonly users: ReadonlyArray<User>
}

interface ICloneRepositoryState {
  /** The user-entered URL or `owner/name` shortcut. */
  readonly url: string

  /** The local path to clone to. */
  readonly path: string

  /** Are we currently trying to load the entered repository? */
  readonly loading: boolean

  /** The current error if one occurred. */
  readonly error: Error | null

  /**
   * The repository identifier that was last parsed from the user-entered URL.
   */
  readonly lastParsedIdentifier: IRepositoryIdentifier | null
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<ICloneRepositoryProps, ICloneRepositoryState> {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    this.state = {
      url: '',
      path: getDefaultDir(),
      loading: false,
      error: null,
      lastParsedIdentifier: null,
    }
  }

  public render() {
    const error = this.state.error
    const disabled =
      this.state.url.length === 0 ||
      this.state.path.length === 0 ||
      this.state.loading ||
      !!error && error.name === DestinationExistsErrorName

    return (
      <Form className='clone-repository' onSubmit={this.clone}>
        <div>
          Enter a repository URL or GitHub username and repository (e.g., <span className='repository-pattern'>hubot/cool-repo</span>)
        </div>

        <TextBox placeholder='URL or username/repository' value={this.state.url} onChange={this.onURLChanged}/>

        <Row>
          <TextBox
            value={this.state.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder='repository path'
            onChange={this.onPathChanged}/>
          <Button onClick={this.showFilePicker}>Choose…</Button>
        </Row>

        <Button disabled={disabled} type='submit'>Clone</Button>

        {error ? <Errors>{error.message}</Errors> : null}

        {this.state.loading ? <Loading/> : null}
      </Form>
    )
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({
      properties: [ 'createDirectory', 'openDirectory' ],
    })
    if (!directory) { return }

    const path = directory[0]
    this.setState({ ...this.state, path })
  }

  private onURLChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const url = event.currentTarget.value
    const parsed = parseOwnerAndName(url)
    const lastParsedIdentifier = this.state.lastParsedIdentifier
    let newPath: string
    if (lastParsedIdentifier) {
      if (parsed) {
        newPath = Path.join(Path.dirname(this.state.path), parsed.name)
      } else {
        newPath = Path.dirname(this.state.path)
      }
    } else if (parsed) {
      newPath = Path.join(this.state.path, parsed.name)
    } else {
      newPath = this.state.path
    }

    this.setState({
      ...this.state,
      url,
      path: newPath,
      lastParsedIdentifier: parsed,
    })

    FS.exists(newPath, exists => {
      // If the path changed while we were checking, we don't care anymore.
      if (this.state.path !== newPath) { return }

      let error: Error | null = null
      if (exists) {
        error = new Error('The destination already exists.')
        error.name = DestinationExistsErrorName
      }

      this.setState({ ...this.state, error })
    })
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.setState({ ...this.state, path })
  }

  private clone = async () => {
    this.setState({ ...this.state, loading: true })

    const url = this.state.url
    const path = this.state.path

    // First try parsing it as a full URL. If that doesn't work, try parsing it
    // as an owner/name shortcut. And if that fails then throw our hands in the
    // air because we truly don't care.
    const parsedURL = parseRemote(url)
    if (parsedURL) {
      const users = this.props.users
      const dotComUser = users.find(u => {
        const htmlURL = getHTMLURL(u.endpoint)
        const parsedEndpoint = URL.parse(htmlURL)
        return parsedURL.hostname === parsedEndpoint.hostname
      }) || null
      this.cloneImpl(url, path, dotComUser)
      return
    }

    const parsedOwnerAndName = parseOwnerAndName(url)
    if (parsedOwnerAndName) {
      const owner = parsedOwnerAndName.owner
      const name = parsedOwnerAndName.name
      const user = await findRepositoryUser(this.props.users, owner, name)
      if (user) {
        const cloneURL = `${getHTMLURL(user.endpoint)}/${url}.git`
        this.cloneImpl(cloneURL, path, user)
      } else {
        this.setState({
          ...this.state,
          loading: false,
          error: new Error(`Couldn't find a repository with that owner and name.`),
        })
      }
      return
    }

    this.setState({
      ...this.state,
      loading: false,
      error: new Error(`Enter a URL or username/repository.`),
    })
  }

  private cloneImpl(url: string, path: string, user: User | null) {
    this.props.dispatcher.clone(url, path, user)
    this.props.dispatcher.closePopup()

    setDefaultDir(Path.resolve(path, '..'))
  }
}

/**
 * Find the user whose endpoint has a repository with the given owner and
 * name. This will prefer dot com over other endpoints.
 */
async function findRepositoryUser(users: ReadonlyArray<User>, owner: string, name: string): Promise<User | null> {
  const hasRepository = async (user: User) => {
    const api = new API(user)
    try {
      const repository = await api.fetchRepository(owner, name)
      if (repository) {
        return true
      } else {
        return false
      }
    } catch (e) {
      return false
    }
  }

  // Prefer .com, then try all the others.
  const sortedUsers = Array.from(users).sort((u1, u2) => {
    if (u1.endpoint === getDotComAPIEndpoint()) {
      return -1
    } else if (u2.endpoint === getDotComAPIEndpoint()) {
      return 1
    } else {
      return 0
    }
  })

  for (const user of sortedUsers) {
    const has = await hasRepository(user)
    if (has) {
      return user
    }
  }

  return null
}

/** Try to parse an owner and name from a URL or owner/name shortcut. */
function parseOwnerAndName(url: string): IRepositoryIdentifier | null {
  const parsed = parseRemote(url)
  // If we can parse it as a remote URL, we'll assume they gave us a proper
  // URL. If not, we'll try treating it as a GitHub repository owner/name
  // shortcut.
  if (parsed) {
    const owner = parsed.owner
    const name = parsed.name
    if (owner && name) {
      return { owner, name }
    }
  }

  const pieces = url.split('/')
  if (pieces.length === 2 && pieces[0].length > 0 && pieces[1].length > 0) {
    const owner = pieces[0]
    const name = pieces[1]
    return { owner, name }
  }

  return null
}
