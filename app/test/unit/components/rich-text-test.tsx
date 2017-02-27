import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import { shallow } from 'enzyme'

import { GitHubRepository } from '../../../src/models/github-repository'
import { Repository } from '../../../src/models/repository'
import { RichText } from '../../../src/ui/lib/rich-text'
import { LinkButton } from '../../../src/ui/lib/link-button'

describe('RichText', () => {
  const emoji = new Map<string, string>([ [ ':shipit:', '/some/path.png' ] ])

  function createComponent(text: string, repository?: Repository) {
    return shallow(
      <RichText emoji={emoji} text={text} repository={repository} />
    )
  }

  describe('with GitHub repository', () => {

    const host = 'https://github.com'
    const endpoint = 'https://api.github.com'
    const login = 'shiftkey'
    const name = 'some-repo'
    const htmlURL = `${host}/${login}/${name}`

    let gitHubRepository: GitHubRepository | null = null
    gitHubRepository = {
      dbID: 1,
      name,
      owner: {
        endpoint,
        login,
      },
      endpoint: 'https://api.github.com',
      fullName: `${login}/${name}`,
      private: false,
      fork: false,
      htmlURL: htmlURL,
      defaultBranch: 'master',
      withAPI: (apiRepository) => {
        return gitHubRepository!
      },
    }

    const repository = new Repository('some/path/to/repo', 1, gitHubRepository)

    it('renders an emoji match', () => {
      const text = 'releasing the thing :shipit:'
      const wrapper = createComponent(text, repository)
      const links = wrapper.find('.emoji')
      expect(links.length).to.equal(1)
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const wrapper = createComponent(text, repository)
      const links = wrapper.find('.emoji')
      expect(links.length).to.equal(0)
    })

    it('does not render link when email address found', () => {
      const text = 'the email address support@github.com should be ignored'
      const wrapper = createComponent(text, repository)
      const links = wrapper.find(LinkButton)
      expect(links.length).to.equal(0)
    })

    it('render link when text starts with a @', () => {
      const expectedUri = `${host}/${login}`
      const text = `@${login} was here`

      const wrapper = createComponent(text, repository)
      const links = wrapper.find(LinkButton)
      expect(links.length).to.equal(1)

      const first = links.at(0).props()
      expect(first.uri).to.equal(expectedUri)
      expect(first.children).to.equal(`@${login}`)
    })

    it('renders link when a mention is found', () => {
      const expectedUri = `${host}/${login}`
      const text = `fixed based on suggestion from @${login}`

      const wrapper = createComponent(text, repository)
      const links = wrapper.find(LinkButton)
      expect(links.length).to.equal(1)

      const first = links.at(0).props()
      expect(first.uri).to.equal(expectedUri)
      expect(first.children).to.equal(`@${login}`)
    })

    it('renders link when an issue reference is found', () => {
      const id = 955
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `Merge pull request #955 from desktop/computering-icons-for-all`
      const wrapper = createComponent(text, repository)
      const links = wrapper.find(LinkButton)
      expect(links.length).to.equal(1)

      const first = links.at(0).props()
      expect(first.uri).to.equal(expectedUri)
      expect(first.children).to.equal(`#${id}`)
    })
  })

  describe('with non-GitHub repository', () => {
    it('renders an emoji match', () => {
      const text = 'releasing the thing :shipit:'
      const wrapper = createComponent(text)
      const links = wrapper.find('.emoji')
      expect(links.length).to.equal(1)
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const wrapper = createComponent(text)
      const links = wrapper.find('.emoji')
      expect(links.length).to.equal(0)
    })

    it('does not render link for mention', () => {
      const text = 'fixed based on suggestion from @shiftkey'
      const wrapper = createComponent(text)
      const links = wrapper.find(LinkButton)
      expect(links.length).to.equal(0)
    })

    it('does not render link for issue reference', () => {
      const text = 'Merge pull request #955 from desktop/computering-icons-for-all'
      const wrapper = createComponent(text)
      const links = wrapper.find(LinkButton)
      expect(links.length).to.equal(0)
    })
  })
})
