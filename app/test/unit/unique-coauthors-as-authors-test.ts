import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ITrailer } from '../../src/lib/git'
import { getUniqueCoauthorsAsAuthors } from '../../src/lib/unique-coauthors-as-authors'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

describe('getUniqueCoauthorsAsAuthors', () => {
  it('can returns empty array for no coauthors', async () => {
    const trailers: ReadonlyArray<ITrailer> = [
      { token: 'Signed-Off-By', value: 'test <test@github.com>' },
    ]

    const commits: Commit[] = [
      buildTestCommit(trailers),
      buildTestCommit([]),
      buildTestCommit(trailers),
    ]

    const coAuthors = getUniqueCoauthorsAsAuthors(commits)
    assert.equal(coAuthors.length, 0)
  })

  it('gets coauthor from commit with coauthor', async () => {
    const email = 'tidy-dev@github.com'
    const name = 'tidy-dev'
    const trailers = [buildTestCoAuthorTrailer(email, name)]
    const commits: Commit[] = [buildTestCommit(trailers)]

    const coAuthors = getUniqueCoauthorsAsAuthors(commits)
    assert.equal(coAuthors.length, 1)
    const coAuthor = coAuthors[0]
    assert.equal(coAuthor.email, email)
    assert.equal(coAuthor.name, name)
  })

  it('does not return duplicate authors', async () => {
    const email = 'tidy-dev@github.com'
    const name = 'tidy-dev'
    const trailers = [buildTestCoAuthorTrailer(email, name)]

    const commits: Commit[] = [
      buildTestCommit(trailers),
      buildTestCommit(trailers),
      buildTestCommit(trailers),
    ]

    const coAuthors = getUniqueCoauthorsAsAuthors(commits)
    assert.equal(coAuthors.length, 1)
    const coAuthor = coAuthors[0]
    assert.equal(coAuthor.email, email)
    assert.equal(coAuthor.name, name)
  })

  it('does not return duplicate authors when name is different and email is the same', async () => {
    const email = 'tidy-dev@github.com'
    const name = 'tidy-dev'
    const trailers = [buildTestCoAuthorTrailer(email, name)]
    const trailersDiffName = [buildTestCoAuthorTrailer(email, name + 'hello')]

    const commits: Commit[] = [
      buildTestCommit(trailers),
      buildTestCommit(trailers),
      buildTestCommit(trailersDiffName),
    ]

    const coAuthors = getUniqueCoauthorsAsAuthors(commits)
    assert.equal(coAuthors.length, 2)
  })

  it('does not return duplicate authors when email is different and name is the same', async () => {
    const email = 'tidy-dev@github.com'
    const otherEmail = 'sergiou87@github.com'
    const name = 'tidy-dev'
    const trailers = [buildTestCoAuthorTrailer(email, name)]
    const trailersDiffEmail = [buildTestCoAuthorTrailer(otherEmail, name)]

    const commits: Commit[] = [
      buildTestCommit(trailers),
      buildTestCommit(trailers),
      buildTestCommit(trailersDiffEmail),
    ]

    const coAuthors = getUniqueCoauthorsAsAuthors(commits)
    assert.equal(coAuthors.length, 2)
  })

  it('can get multiple coauthors on multiple commits', async () => {
    const first_email = 'tidy-dev@github.com'
    const first_name = 'tidy-dev'
    const firstTrailers = [buildTestCoAuthorTrailer(first_email, first_name)]

    const second_email = 'sergiou87@github.com'
    const second_name = 'Sergio'
    const secondTrailers = [buildTestCoAuthorTrailer(second_email, second_name)]

    const commits: Commit[] = [
      buildTestCommit(firstTrailers),
      buildTestCommit([]),
      buildTestCommit(secondTrailers),
    ]

    const coAuthors = getUniqueCoauthorsAsAuthors(commits)
    assert.equal(coAuthors.length, 2)
    const coAuthorEmails = coAuthors.map(c => c.email)
    assert(coAuthorEmails.includes(first_email))
    assert(coAuthorEmails.includes(second_email))
  })
})

function buildTestCommit(trailers: ReadonlyArray<ITrailer>): Commit {
  const author = new CommitIdentity('test', 'test', new Date())

  return new Commit(
    'test',
    'test',
    'test',
    'test',
    author,
    author,
    [],
    trailers,
    []
  )
}

function buildTestCoAuthorTrailer(email: string, name: string) {
  return { token: 'Co-Authored-By', value: `${name} <${email}>` }
}
