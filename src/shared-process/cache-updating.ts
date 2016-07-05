import GitHubRepositoriesCache from './github-repositories-cache'
import UsersStore from './users-store'
import API from '../lib/api'
import GitHubRepository from '../models/github-repository'
import Owner from '../models/owner'

export async function updateCaches(usersStore: UsersStore, cache: GitHubRepositoriesCache) {
  console.log('Updating caches…')

  try {
    await updateGitHubRepositoriesCache(usersStore, cache)
  } catch (e) {
    console.error('Error updating cache:')
    console.error(e)
  }

  console.log('Cache update done.')
}

async function updateGitHubRepositoriesCache(usersStore: UsersStore, cache: GitHubRepositoriesCache) {
  const users = usersStore.getUsers()
  for (let user of users) {
    const api = new API(user)
    const repos = await api.fetchRepositories()

    // TODO: We need to update existing repos and delete missing repos.
    console.log(`Adding ${repos.length} repositories…`)
    for (let repo of repos) {
      const owner = new Owner(repo.owner.login, user.endpoint)
      const ghRepo = new GitHubRepository(repo.name, owner, repo.id, repo.cloneUrl, repo.gitUrl, repo.sshUrl, repo.htmlUrl)
      await cache.addRepository(ghRepo)
    }
  }
}
