import User from '../user'

const Octokat = require('octokat')

export interface Repo {
  cloneUrl: string,
  htmlUrl: string,
  name: string
  owner: {
    avatarUrl: string,
    login: string
    type: 'user' | 'org'
  },
  private: boolean,
  stargazersCount: number
}

export default class API {
  private client: any

  public constructor(user: User) {
    this.client = new Octokat({token: user.getToken(), rootURL: user.getEndpoint()})
  }

  public async fetchRepos(): Promise<Repo[]> {
    const results: Repo[] = []
    let nextPage = this.client.user.repos
    while (nextPage) {
      const request = await nextPage.fetch()
      results.push(...request.items)
      nextPage = request.nextPage
    }

    return results
  }
}
