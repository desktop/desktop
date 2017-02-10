import * as React from 'react'

import { IAutocompletionProvider } from './index'
import { GitHubUserStore } from '../../lib/dispatcher'
import { GitHubRepository } from '../../models/github-repository'

/** An autocompletion hit for a user. */
export interface IUserHit {
  /** The username. */
  readonly username: string

  /** The user's name. */
  readonly name: string
}

/** The autocompletion provider for user mentions in a GitHub repository. */
export class UserAutocompletionProvider implements IAutocompletionProvider<IUserHit> {
  private readonly gitHubUserStore: GitHubUserStore
  private readonly repository: GitHubRepository

  public constructor(gitHubUserStore: GitHubUserStore, repository: GitHubRepository) {
    this.gitHubUserStore = gitHubUserStore
    this.repository = repository
  }

  public getRegExp(): RegExp {
    return /(?:^|\n| )(?:@)([a-z0-9\\+\\-][a-z0-9_]*)?/g
  }

  public async getAutocompletionItems(text: string): Promise<ReadonlyArray<IUserHit>> {
    const users = await this.gitHubUserStore.getMentionableUsers(this.repository)
    const filtered = users.filter(u => {
      const login = u.login
      if (login && login.startsWith(text)) {
        return true
      }

      // `name` shouldn't even be `undefined` going forward, but older versions
      // of the user cache didn't persist `name`. The `GitHubUserStore` will fix
      // that, but autocompletions could be requested before that happens. So we
      // need to check here even though the type says its superfluous.
      const name = u.name
      if (name && u.name.includes(text)) {
        return true
      }

      return false
    })
    return filtered.map(u => ({ username: u.login!, name: u.name }))
  }

  public renderItem(item: IUserHit): JSX.Element {
    return (
      <div className='user' key={item.username}>
        <span className='username'>{item.username}</span>
        <span className='name'>{item.name}</span>
      </div>
    )
  }

  public getCompletionText(item: IUserHit): string {
    return `@${item.username}`
  }
}
