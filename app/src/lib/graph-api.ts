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
   readonly id: string
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
 * A wrapper for the response from the GraphQL endpoint
 */
interface IGraphQLResponse<T> {
  readonly status: number
  readonly value: T
}


interface IPaginationResult<T> {
  readonly results: ReadonlyArray<T>
  readonly hasNextPage: boolean
  readonly endCursor: string | null
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

   private async fetchPageOfRepos(size: number, since: string | null): Promise<IPaginationResult<IGraphAPIRepository>> {
     const query = `
     {
        viewer {
          repositories(first: ${size} ${ since ? 'after: \"' + since + '\"' : '' }) {
            pageInfo {
              hasNextPage
            }
            edges {
              cursor
              node {
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
          }
        }
      }`
     const payload = {
       query: query,
       variables: ''
     }

     const response = await this.makeRequest<any>(payload)

     const results: IGraphAPIRepository[] = []

     if (response.status === 404) {
       console.debug(`[fetchPageOfRepos] - unable to fetch repositories for current user`)
       return  { results: results, hasNextPage: false, endCursor: null }
     }

     const data = response.value
     if (data.viewer === null) {
       console.debug(`[fetchPageOfRepos] - user does not exist`)
       return  { results: results, hasNextPage: false, endCursor: null }
     }

     let lastCursor = ''
     const repositories = data.viewer.repositories
     const edges = repositories.edges

     for (let i = 0; i < edges.length; i++) {

       const result = edges[i]
       lastCursor = result.cursor

       const repository = result.node

       results.push({
         cloneUrl: '',
         htmlUrl: '',
         name: repository.name,
         owner: {
           id: repository.owner.id,
           type: 'user',
           login: repository.owner.login,
           avatarUrl: repository.owner.avatarUrl,
           url: `https://api.github.com/users/${repository.owner.login}`
         },
         private: repository.isPrivate,
         fork: repository.isFork,
         stargazersCount: repository.stars.totalCount,
         defaultBranch: repository.defaultBranch
       })
     }

     const hasNextPage = repositories.pageInfo.hasNextPage

     return  { results: results, hasNextPage: hasNextPage, endCursor: lastCursor }
   }

  public async fetchRepos(): Promise<ReadonlyArray<IGraphAPIRepository>> {
    const results: IGraphAPIRepository[] = []
    let cursor: string | null = null

    while (true) {
      const page: IPaginationResult<IGraphAPIRepository> = await this.fetchPageOfRepos(30, cursor)
      page.results.forEach(r => results.push(r))
      cursor = page.endCursor
      if (!page.hasNextPage) {
        break
      }
    }

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
      console.error(`[fetchRepository] - unable to access repository ${owner}/${name}`)
      return Promise.reject(`unable to fetch repository information for ${owner}/${name}`)
    }

    const contents = response.value
    if (contents.repositoryOwner === null) {
      console.error(`[fetchRepository] - invalid response for ${owner}/${name}`)
      return Promise.reject(`invalid response when fetching repository ${owner}/${name}`)
    }

    const repository = contents.repositoryOwner.repository

    return {
      cloneUrl: '',
      htmlUrl: '',
      name: repository.name,
      owner: {
        id: repository.owner.id,
        type: 'user',
        login: repository.owner.login,
        avatarUrl: repository.owner.avatarUrl,
        url: `https://api.github.com/users/${repository.owner.login}`
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
      console.error(`[fetchCommit] - unable to access commit ${owner}/${name}@${sha}`)
      return null
    }

    const contents = response.value
    if (contents.repositoryOwner === null) {
      console.error(`[fetchCommit] - no commit found for ${owner}/${name}@${sha}`)
      return null
    }

    const commit = contents.repositoryOwner.repository.commit

    return {
      sha: commit.oid,
      author: {
        id: commit.user.id,
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
    query ($query: String!) {
      search(first: 1, type: USER, query: $query) {
        userCount
        edges {
          cursor
          node {
            ... on User {
              id
              login
              avatarURL
              websiteURL
              name
            }
          }
        }
      }
    }`
    const payload = { operationName: null,
      query: query,
      variables: {
        'query': `in:email ${email}`
        }
      }

    const response = await this.makeRequest<any>(payload)

    if (response.status === 404) {
      console.error(`[searchForUserWithEmail] - unable to find match for ${email}`)
      return null
    }

    const results = response.value.search

    if (results.userCount === 0) {
      console.error(`[searchForUserWithEmail] - result doesn't exit for ${email}`)
      return null
    }

    const user = results.edges[0].node

    return {
        id: user.id,
        url: user.websiteURL,
        type: 'user',
        login: user.login,
        avatarUrl: user.avatarURL
    }
  }

  private async fetchPageOfOrgs(size: number, since: string | null): Promise<IPaginationResult<IGraphAPIUser>> {
    const query = `
    {
      viewer {
        organizations(first: ${size} ${ since ? 'after: \"' + since + '\"' : '' }) {
          pageInfo {
            hasNextPage
          }
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

    const results: IGraphAPIUser[] = []

    if (response.status === 404) {
      console.debug(`[fetchPageOfOrgs] - unable to fetch orgs for current user`)
      return  { results: results, hasNextPage: false, endCursor: null }
    }

    const data = response.value
    if (data.viewer === null) {
      console.debug(`[fetchPageOfOrgs] - user does not exist`)
      return  { results: results, hasNextPage: false, endCursor: null }
    }

    let lastCursor = ''
    const organizations = data.viewer.organizations
    const edges = organizations.edges

    for (let i = 0; i < edges.length; i++) {

      const result = edges[i]
      lastCursor = result.cursor

      const organization = result.node

      results.push({
        id: organization.id,
        type: 'org',
        login: organization.login,
        avatarUrl: organization.avatarURL,
        url: `https://api.github.com/users/${organization.login}`
      })
    }

    const hasNextPage = organizations.pageInfo.hasNextPage

    return  { results: results, hasNextPage: hasNextPage, endCursor: lastCursor }
  }

  public async fetchOrgs(): Promise<ReadonlyArray<IGraphAPIUser>> {
    const results: IGraphAPIUser[] = []
    let cursor: string | null = null

    while (true) {
      const page: IPaginationResult<IGraphAPIUser> = await this.fetchPageOfOrgs(30, cursor)
      page.results.forEach(r => results.push(r))
      cursor = page.endCursor
      if (!page.hasNextPage) {
        break
      }
    }

    return results
  }

  public async createRepository(org: IGraphAPIUser | null, name: string, description: string, private_: boolean): Promise<IGraphAPIRepository> {
    if (org) {
      return Promise.reject('TODO')
    } else {
      return Promise.reject('TODO')
    }
  }
}
