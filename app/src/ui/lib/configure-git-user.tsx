import * as React from 'react'
import { Commit } from '../../models/commit'
import { lookupPreferredEmail } from '../../lib/email'
import {
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../lib/git/config'
import { CommitListItem } from '../history/commit-list-item'
import { Account } from '../../models/account'
import { CommitIdentity } from '../../models/commit-identity'
import { Form } from '../lib/form'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

interface IConfigureGitUserProps {
  /** The logged-in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** Called after the user has chosen to save their config. */
  readonly onSave?: () => void

  /** The label for the button which saves config changes. */
  readonly saveLabel?: string
}

interface IConfigureGitUserState {
  readonly name: string
  readonly email: string
  readonly avatarURL: string | null
}

/**
 * A component which allows the user to configure their Git user.
 *
 * Provide `children` elements which will be rendered below the form.
 */
export class ConfigureGitUser extends React.Component<
  IConfigureGitUserProps,
  IConfigureGitUserState
> {
  public constructor(props: IConfigureGitUserProps) {
    super(props)

    this.state = { name: '', email: '', avatarURL: null }
  }

  public async componentWillMount() {
    let name = await getGlobalConfigValue('user.name')
    let email = await getGlobalConfigValue('user.email')

    const user = this.props.accounts[0]
    if ((!name || !name.length) && user) {
      name = user.name && user.name.length ? user.name : user.login
    }

    if ((!email || !email.length) && user) {
      const found = lookupPreferredEmail(user.emails)
      if (found) {
        email = found.email
      }
    }

    const avatarURL = email ? this.avatarURLForEmail(email) : null
    this.setState({ name: name || '', email: email || '', avatarURL })
  }

  private dateWithMinuteOffset(date: Date, minuteOffset: number): Date {
    const copy = new Date(date.getTime())
    copy.setTime(copy.getTime() + minuteOffset * 60 * 1000)
    return copy
  }

  public render() {
    const now = new Date()
    const dummyAuthor1 = new CommitIdentity(
      'Hubot',
      this.state.email,
      this.dateWithMinuteOffset(now, -2)
    )
    const dummyCommit1 = new Commit('', 'Do more things', '', dummyAuthor1, [])

    const dummyAuthor3 = new CommitIdentity(
      'Hubot',
      this.state.email,
      this.dateWithMinuteOffset(now, -60)
    )
    const dummyCommit3 = new Commit('', 'Add some things', '', dummyAuthor3, [])

    // NB: We're using the name as the commit SHA:
    //  1. `Commit` is referentially transparent wrt the SHA. So in order to get
    //     it to update when we name changes, we need to change the SHA.
    //  2. We don't display the SHA so the user won't ever know our secret.
    const dummyAuthor2 = new CommitIdentity(
      this.state.name,
      this.state.email,
      this.dateWithMinuteOffset(now, -30)
    )
    const dummyCommit2 = new Commit(
      this.state.name,
      'Fix all the things',
      '',
      dummyAuthor2,
      []
    )
    const emoji = new Map()
    return (
      <div id="configure-git-user">
        <Form className="sign-in-form" onSubmit={this.save}>
          <TextBox
            label="Name"
            placeholder="Hubot"
            value={this.state.name}
            onChange={this.onNameChange}
          />

          <TextBox
            label="Email"
            placeholder="hubot@github.com"
            value={this.state.email}
            onChange={this.onEmailChange}
          />

          <Row>
            <Button type="submit">
              {this.props.saveLabel || 'Save'}
            </Button>
            {this.props.children}
          </Row>
        </Form>

        <div id="commit-list" className="commit-list-example">
          <CommitListItem commit={dummyCommit1} emoji={emoji} user={null} />
          <CommitListItem
            commit={dummyCommit2}
            emoji={emoji}
            user={this.getAvatarUser()}
          />
          <CommitListItem commit={dummyCommit3} emoji={emoji} user={null} />
        </div>
      </div>
    )
  }

  private getAvatarUser() {
    const email = this.state.email
    const avatarURL = this.state.avatarURL
    const name = this.state.name
    if (email && avatarURL && name) {
      return { email, avatarURL, name }
    } else {
      return null
    }
  }

  private onNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      name: event.currentTarget.value,
      email: this.state.email,
      avatarURL: this.state.avatarURL,
    })
  }

  private onEmailChange = (event: React.FormEvent<HTMLInputElement>) => {
    const email = event.currentTarget.value
    const avatarURL = this.avatarURLForEmail(email)

    this.setState({
      name: this.state.name,
      email,
      avatarURL,
    })
  }

  private avatarURLForEmail(email: string): string | null {
    const matchingAccount = this.props.accounts.find(
      a => a.emails.findIndex(e => e.email === email) > -1
    )
    return matchingAccount ? matchingAccount.avatarURL : null
  }

  private save = async () => {
    if (this.props.onSave) {
      this.props.onSave()
    }

    const name = this.state.name
    if (name.length) {
      await setGlobalConfigValue('user.name', name)
    }

    const email = this.state.email
    if (email.length) {
      await setGlobalConfigValue('user.email', email)
    }
  }
}
