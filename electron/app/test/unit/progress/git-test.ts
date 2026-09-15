import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  GitProgressParser,
  IGitProgress,
  IGitProgressInfo,
} from '../../../src/lib/progress'
import { parse } from '../../../src/lib/progress/git'

describe('GitProgressParser', () => {
  it('requires at least one step', () => {
    assert.throws(() => new GitProgressParser([]))
  })

  it('parses progress with one step', () => {
    const parser = new GitProgressParser([
      { title: 'remote: Compressing objects', weight: 1 },
    ])

    assert.equal(
      parser.parse('remote: Compressing objects:  72% (16/22)').percent,
      16 / 22
    )
  })

  it('parses progress with several steps', () => {
    const parser = new GitProgressParser([
      { title: 'remote: Compressing objects', weight: 0.5 },
      { title: 'Receiving objects', weight: 0.5 },
    ])

    let result

    result = parser.parse('remote: Compressing objects:  72% (16/22)')

    assert.equal(result.kind, 'progress')
    assert.equal((result as IGitProgress).percent, 16 / 22 / 2)

    result = parser.parse(
      'Receiving objects:  99% (166741/167587), 267.24 MiB | 2.40 MiB/s'
    )

    assert.equal(result.kind, 'progress')
    assert.equal((result as IGitProgress).percent, 0.5 + 166741 / 167587 / 2)
  })

  it('enforces ordering of steps', () => {
    const parser = new GitProgressParser([
      { title: 'remote: Compressing objects', weight: 0.5 },
      { title: 'Receiving objects', weight: 0.5 },
    ])

    let result

    result = parser.parse('remote: Compressing objects:  72% (16/22)')

    assert.equal(result.kind, 'progress')
    assert.equal((result as IGitProgress).percent, 16 / 22 / 2)

    result = parser.parse(
      'Receiving objects:  99% (166741/167587), 267.24 MiB | 2.40 MiB/s'
    )

    assert.equal(result.kind, 'progress')
    assert.equal((result as IGitProgress).percent, 0.5 + 166741 / 167587 / 2)

    result = parser.parse('remote: Compressing objects:  72% (16/22)')

    assert.equal(result.kind, 'context')
  })

  it('parses progress with no total', () => {
    const result = parse('remote: Counting objects: 167587')

    assert.deepStrictEqual(result, {
      title: 'remote: Counting objects',
      text: 'remote: Counting objects: 167587',
      value: 167587,
      done: false,
      percent: undefined,
      total: undefined,
    } as IGitProgressInfo)
  })

  it('parses final progress with no total', () => {
    const result = parse('remote: Counting objects: 167587, done.')

    assert.deepStrictEqual(result, {
      title: 'remote: Counting objects',
      text: 'remote: Counting objects: 167587, done.',
      value: 167587,
      done: true,
      percent: undefined,
      total: undefined,
    } as IGitProgressInfo)
  })

  it('parses progress with total', () => {
    const result = parse('remote: Compressing objects:  72% (16/22)')

    assert.deepStrictEqual(result, {
      title: 'remote: Compressing objects',
      text: 'remote: Compressing objects:  72% (16/22)',
      value: 16,
      done: false,
      percent: 72,
      total: 22,
    } as IGitProgressInfo)
  })

  it('parses final with total', () => {
    const result = parse('remote: Compressing objects: 100% (22/22), done.')

    assert.deepStrictEqual(result, {
      title: 'remote: Compressing objects',
      text: 'remote: Compressing objects: 100% (22/22), done.',
      value: 22,
      done: true,
      percent: 100,
      total: 22,
    } as IGitProgressInfo)
  })

  it('parses with total and throughput', () => {
    const result = parse(
      'Receiving objects:  99% (166741/167587), 267.24 MiB | 2.40 MiB/s'
    )

    assert.deepStrictEqual(result, {
      title: 'Receiving objects',
      text: 'Receiving objects:  99% (166741/167587), 267.24 MiB | 2.40 MiB/s',
      value: 166741,
      done: false,
      percent: 99,
      total: 167587,
    } as IGitProgressInfo)
  })

  it('parses final with total and throughput', () => {
    const result = parse(
      'Receiving objects: 100% (167587/167587), 279.67 MiB | 2.43 MiB/s, done.'
    )

    assert.deepStrictEqual(result, {
      title: 'Receiving objects',
      text: 'Receiving objects: 100% (167587/167587), 279.67 MiB | 2.43 MiB/s, done.',
      value: 167587,
      done: true,
      percent: 100,
      total: 167587,
    } as IGitProgressInfo)
  })

  it("does not parse things that aren't progress", () => {
    const result = parse(
      'remote: Total 167587 (delta 19), reused 11 (delta 11), pack-reused 167554         '
    )
    assert(result === null)
  })
})
