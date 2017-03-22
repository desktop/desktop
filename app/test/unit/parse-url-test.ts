import * as chai from 'chai'
const expect = chai.expect

import { parseURL, IOpenRepositoryAction } from '../../src/lib/parse-url'

describe('parseURL', () => {
  it('returns unknown by default', () => {
    expect(parseURL('').name).to.equal('unknown')
  })

  describe('openRepo', () => {
    it('returns URL for valid clone', () => {
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
