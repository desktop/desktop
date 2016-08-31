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
  * Information about a commit as returned by the GitHub API.
  */
 export interface IGraphAPICommit {
   readonly sha: string
   readonly author: IGraphAPIUser
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
 * A wrapper for the response from the GraphQL endpoint
 */
interface IGraphQLResponse<T> {
  readonly status: number
  readonly value: T
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

   private async makeRequest<T>(payload: any): Promise<IGraphQLResponse<T>> {
     const headers = new Headers()
     headers.append('Authorization', `Bearer ${this.token}`)
     headers.append('Content-Type', 'application/json')

     const request = new Request(this.rootURL, {
       method: 'POST',
       headers: headers,
       body: JSON.stringify(payload)
     })

     const response = await window.fetch(request)

     const status = response.status

     const json = await response.json()
     const contents = json.data as any

     return { status: status, value: contents }
   }

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
          stars(first: 1) {
            totalCount
          }
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

    const response = await this.makeRequest<any>(payload)

    if (response.status === 404) {
      console.debug(`[fetchRepository] - unable to access repository ${owner}/${name}`)
      return this.api.fetchRepository(owner, name)
    }

    const contents = response.value
    if (contents.repositoryOwner === null) {
      console.debug(`[fetchRepository] - no repository owner found for ${owner}/${name}`)
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
      stargazersCount: repository.stars.totalCount,
      defaultBranch: repository.defaultBranch
    }
  }

  public async fetchCommit(owner: string, name: string, sha: string): Promise<IGraphAPICommit | null> {

    const query = `
    query ($owner: String!, $name: String!, $sha: GitObjectID!) {
      repositoryOwner(login: $owner) {
        repository(name: $name) {
          commit(oid: $sha) {
            oid
            author {
              user {
                id
                websiteURL
                login
                avatarURL
              }
            }
          }
        }
      }
    }`
    const payload = { operationName: null,
      query: query,
      variables: {
        'owner': owner,
        'name': name,
        'sha': sha
        }
      }

    const response = await this.makeRequest<any>(payload)

    if (response.status === 404) {
      console.debug(`[fetchCommit] - unable to access commit ${owner}/${name}@${sha}`)
      return this.api.fetchCommit(owner, name, sha)
    }

    const contents = response.value
    if (contents.repositoryOwner === null) {
      console.debug(`[fetchCommit] - no commit found for ${owner}/${name}@${sha}`)
      return this.api.fetchCommit(owner, name, sha)
    }

    const commit = contents.repositoryOwner.repository.commit

    return {
      sha: commit.oid,
      author: {
        id: -1,
        url: commit.user.websiteURL,
        type: 'user',
        login: commit.user.login,
        avatarUrl: commit.user.avatarURL
      }
    }
  }

  /** Search for a user with the given public email. */
  public async searchForUserWithEmail(email: string): Promise<IGraphAPIUser | null> {

    const query = `
    query ($email: String!) {
      search(first: 1, type: USER, query: $email) {
       edges {
         node {
           // TODO: seems incomplete
          }
        }
      }
    }`
    const payload = { operationName: null,
      query: query,
      variables: {
        'email': email
        }
      }

    const response = await this.makeRequest<any>(payload)

    if (response.status === 404) {
      console.debug(`[searchForUserWithEmail] - unable to find match for ${email}`)
      return this.api.searchForUserWithEmail(email)
    }

    // TODO: need to handle the pagination-esque payload here

    const contents = response.value
    if (contents.repositoryOwner === null) {
      console.debug(`[searchForUserWithEmail] - result doesn't exit for ${email}`)
      return this.api.searchForUserWithEmail(email)
    }

    const commit = contents.repositoryOwner.repository.commit

    return {
        id: -1,
        url: commit.user.websiteURL,
        type: 'user',
        login: commit.user.login,
        avatarUrl: commit.user.avatarURL
    }
  }

  public async fetchOrgs(): Promise<ReadonlyArray<IGraphAPIUser>> {

    // TODO: handle pagination

    const query = `
    query {
      viewer {
        organizations(first: 30) {
          edges {
            cursor
            node {
              id
              login
              name
              avatarURL
            }
          }
        }
      }
    }`
    const payload = {
      query: query,
      variables: ''
    }

    const response = await this.makeRequest<any>(payload)

    if (response.status === 404) {
      console.debug(`[fetchOrgs] - unable to fetch orgs for current user`)
      return this.api.fetchOrgs()
    }

    const contents = response.value
    if (contents.viewer === null) {
      console.debug(`[fetchOrgs] - user does not exist`)
      return this.api.fetchOrgs()
    }

    const organizations = contents.viewer.organizations.edges

    const results: IGraphAPIUser[] = []

    for (let i = 0; i < organizations.length; i++) {

      const organization = organizations[i]

      results.push({
        id: -1, // no numeric identifier currently available
        url: organization.node.websiteURL, // undefined
        type: 'org',
        login: organization.node.login,
        avatarUrl: organization.node.avatarURL
      })
    }

    return results
  }
}
