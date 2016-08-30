import User from '../models/user'
import API from './api'

 /**
  * Information about a repository as returned by the GitHub API.
  */
 export interface IGraphAPIRepository {
   readonly cloneUrl: string
   readonly htmlUrl: string
   readonly name: string
   readonly owner: IGraphAPIUser
   readonly private: boolean
   readonly fork: boolean
   readonly stargazersCount: number
   readonly defaultBranch: string
 }

 /**
  * Information about a user as returned by the GitHub API.
  */
 export interface IGraphAPIUser {
   readonly id: number
   readonly url: string
   readonly type: 'user' | 'org'
   readonly login: string
   readonly avatarUrl: string
 }

 /**
  * An object for making authenticated requests to the GitHub API
  */
export default class GraphAPI {
  private readonly rootURL = 'https://api.github.com/graphql'
  private readonly token: string
  private readonly api: API

  public constructor(user: User) {
    this.token = user.token
    this.api = new API(user)
  }

  /**
   * Loads all repositories accessible to the current user.
   *
   * Loads public and private repositories across all organizations
   * as well as the user account.
   *
   * @returns A promise yielding an array of {APIRepository} instances or error
   */

  public async fetchRepos(): Promise<ReadonlyArray<IGraphAPIRepository>> {
    const results: IGraphAPIRepository[] = []
    return results
  }

  public async fetchRepository(owner: string, name: string): Promise<IGraphAPIRepository> {
    const query = `
      query ($owner: String!, $name: String!) {
        repositoryOwner(login: $owner) {
          repository(name: $name) {
            id
            name
            owner {
              login
            }
            isFork
            isPrivate
          }
        }
      }`
    const payload = { operationName: null,
      query: query,
      variables: {
        'owner': owner,
        'name': name
        }
      }

    const headers = new Headers()
    headers.append('Authorization', `Bearer ${this.token}`)
    headers.append('Content-Type', 'application/json')

    const request = new Request(this.rootURL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    })

    const response = await window.fetch(request)

    if (response.status === 404) {
      // may not exist, or may not be open to usage here
      // fall back to existing method
      return this.api.fetchRepository(owner, name)
    }

    const json = await response.json()
    const contents = json.data as any

    if (contents.repositoryOwner === null) {
      // may not exist, or may not be open to usage here
      // fall back to existing method
      return this.api.fetchRepository(owner, name)
    }

    const repository = contents.repositoryOwner.repository

    return {
      cloneUrl: '',
      htmlUrl: '',
      name: repository.name,
      owner: {
        id: 1,
        url: '',
        type: 'user',
        login: repository.owner.login,
        avatarUrl: 'https://github.com/hubot.png'
      },
      private: repository.isPrivate,
      fork: repository.isFork,
      stargazersCount: -1,
      defaultBranch: repository.defaultBranch
    }
  }
}
