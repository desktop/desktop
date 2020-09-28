import { sanitizedRepositoryName } from '../../src/ui/add-repository/sanitized-repository-name'

describe('sanitizedRepositoryName', () => {
  it('leaves a good repo name alone', () => {
    const repoName = 'this-is-fine'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe('this-is-fine')
  })

  it('replaces invalid characters with dashes', () => {
    const repoName = '.this..is\\not fine:yo?|is-it'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe('.this..is-not-fine-yo--is-it')
  })

  it('replaces space with dashes', () => {
    const repoName = 'repo space name'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe('repo-space-name')
  })

  it('replaces ending slash with dashes', () => {
    const repoName = 'hello/'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe('hello-')
  })

  it('does not allow name to start with plus, replaces it with dashes', () => {
    const repoName = '++but-can-still-keep-the-rest'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe('--but-can-still-keep-the-rest')
  })

  it('allow name to start with minus', () => {
    const repoName = '--but-can-still-keep-the-rest'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe(repoName)
  })

  it('replaces slash in newlines with dash', () => {
    const repoName = 'hello\\r\\nworld'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe('hello-r-nworld')
  })

  it('allow name to have dots', () => {
    const repoName = '.first.dot.is.ok'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe(repoName)
  })

  it('allows double dashes', () => {
    const repoName = 'repo--name'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe(repoName)
  })

  it('replaces one emoji with one dash', () => {
    const repoName = 'hello🐓world-repo'
    const result = sanitizedRepositoryName(repoName)
    expect(result).toBe('hello-world-repo')
  })
})
