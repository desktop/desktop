import { expect } from 'chai'

import { parse, IGitProgress } from '../../src/lib/progress'

describe('progress parser', () => {
  it('parses progress with no total', () => {
    const result = parse('remote: Counting objects: 167587')

    expect(result).to.deep.equal(<IGitProgress>{
      title: 'remote: Counting objects',
      value: 167587,
      done: false,
      percent: undefined,
      total: undefined,
    })
  })

  it('parses final progress with no total', () => {
    const result = parse('remote: Counting objects: 167587, done.')

    expect(result).to.deep.equal(<IGitProgress>{
      title: 'remote: Counting objects',
      value: 167587,
      done: true,
      percent: undefined,
      total: undefined,
    })
  })

  it('parses progress with total', () => {
    const result = parse('remote: Compressing objects:  72% (16/22)')

    expect(result).to.deep.equal(<IGitProgress>{
      title: 'remote: Compressing objects',
      value: 16,
      done: false,
      percent: 72,
      total: 22,
    })
  })

  it('parses final with total', () => {
    const result = parse('remote: Compressing objects: 100% (22/22), done.')

    expect(result).to.deep.equal(<IGitProgress>{
      title: 'remote: Compressing objects',
      value: 22,
      done: true,
      percent: 100,
      total: 22,
    })
  })

  it('parses with total and throughput', () => {
    const result = parse('Receiving objects:  99% (166741/167587), 267.24 MiB | 2.40 MiB/s')

    expect(result).to.deep.equal(<IGitProgress>{
      title: 'Receiving objects',
      value: 166741,
      done: false,
      percent: 99,
      total: 167587,
    })
  })

  it('parses final with total and throughput', () => {
    const result = parse('Receiving objects: 100% (167587/167587), 279.67 MiB | 2.43 MiB/s, done.')

    expect(result).to.deep.equal(<IGitProgress>{
      title: 'Receiving objects',
      value: 167587,
      done: true,
      percent: 100,
      total: 167587,
    })
  })

  it('does not parse things that aren\'t progress', () => {
    const result = parse('remote: Total 167587 (delta 19), reused 11 (delta 11), pack-reused 167554         ')
    expect(result).to.be.null
  })
})
