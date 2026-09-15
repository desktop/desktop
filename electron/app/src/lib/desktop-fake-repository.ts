import { Repository } from '../models/repository'
import { getDotComAPIEndpoint } from './api'
import { GitHubRepository } from '../models/github-repository'
import { Owner } from '../models/owner'

// HACK: This is needed because the `Rich`Text` component needs to know what
// repo to link issues against. Used when we can't rely on the repo info we keep
// in state because we it need Desktop specific, so we've stubbed out this repo
const desktopOwner = new Owner('desktop', getDotComAPIEndpoint(), -1)
const desktopUrl = 'https://github.com/desktop/desktop'
export const DesktopFakeRepository = new Repository(
  '',
  -1,
  new GitHubRepository('desktop', desktopOwner, -1, false, desktopUrl),
  true
)
