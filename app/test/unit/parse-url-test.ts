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
      expect(openRepo.args.url).to.equal('https://github.com/desktop/desktop.git')
    })

    it('returns unknown when no remote defined', () => {
      const result = parseURL('github-mac://openRepo/')
      expect(result.name).to.equal('unknown')
    })

    it('adds branch name if set', () => {
      const result = parseURL('github-mac://openRepo/https://github.com/desktop/desktop?branch=cancel-2fa-flow')
      expect(result.name).to.equal('open-repository')

      const openRepo = result as IOpenRepositoryAction
      expect(openRepo.args.url).to.equal('https://github.com/desktop/desktop.git')
      expect(openRepo.args.branch).to.equal('cancel-2fa-flow')
    })

    it('adds pull request ID if found', () => {
      const result = parseURL('github-mac://openRepo/https://github.com/octokit/octokit.net?branch=pr%2F1569&pr=1569')
      expect(result.name).to.equal('open-repository')

      const openRepo = result as IOpenRepositoryAction
      expect(openRepo.args.url).to.equal('https://github.com/octokit/octokit.net.git')
      expect(openRepo.args.branch).to.equal('pr/1569')
      expect(openRepo.args.pr).to.equal('1569')
    })

    it('returns unknown for unexpected pull request input', () => {
      const result = parseURL('github-mac://openRepo/https://github.com/octokit/octokit.net?branch=bar&pr=foo')
      expect(result.name).to.equal('unknown')
    })

    it('returns unknown for invalid branch name', () => {
      // branch=<>
      const result = parseURL('github-mac://openRepo/https://github.com/octokit/octokit.net?branch=%3C%3E')
      expect(result.name).to.equal('unknown')
    })

    it('adds file path if found', () => {
      const result = parseURL('github-mac://openRepo/https://github.com/octokit/octokit.net?branch=master&filepath=Octokit.Reactive%2FOctokit.Reactive.csproj')
      expect(result.name).to.equal('open-repository')

      const openRepo = result as IOpenRepositoryAction
      expect(openRepo.args.url).to.equal('https://github.com/octokit/octokit.net.git')
      expect(openRepo.args.branch).to.equal('master')
      expect(openRepo.args.filepath).to.equal('Octokit.Reactive/Octokit.Reactive.csproj')
    })
  })
})
