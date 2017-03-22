import * as chai from 'chai'
const expect = chai.expect

import { parseURL, IOpenRepositoryAction, IOAuthAction } from '../../src/lib/parse-url'

describe('parseURL', () => {
  it('returns unknown by default', () => {
    expect(parseURL('').name).to.equal('unknown')
  })

  describe('oauth', () => {
    it('returns right name', () => {
      const expectedArgs = {
        'code': '18142422',
      }

      const result = parseURL('x-github-client://oauth?code=18142422&state=e4cd2dea-1567-46aa-8eb2-c7f56e943187')
      expect(result.name).to.equal('oauth')

      const openRepo = result as IOAuthAction
      expect(openRepo.args).to.deep.equal(expectedArgs)
    })
  })

  describe('openRepo', () => {
    it('returns right name', () => {
      const result = parseURL('github-mac://openRepo/https://github.com/desktop/desktop')
      expect(result.name).to.equal('open-repository')

      const openRepo = result as IOpenRepositoryAction
      expect(openRepo.args).to.equal('https://github.com/desktop/desktop.git')
    })

    // TODO: match on known patterns and extract:
    //
    // local branch in the repository
    // -> github-mac://openRepo/https://github.com/desktop/desktop?branch=cancel-2fa-flow
    //
    // pull request from fork
    // -> github-mac://openRepo/https://github.com/octokit/octokit.net?branch=pr%2F1569&pr=1569
    //
    // open file
    // -> github-mac://openRepo/https://github.com/octokit/octokit.net?branch=master&filepath=README.md


  })

})
