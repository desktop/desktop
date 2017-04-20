import { expect } from 'chai'

import { StepProgressParser, ICombinedProgress } from '../../src/lib/progress'

describe('StepProgressParser', () => {

  it('requires at least one step', () => {
    expect(() => new StepProgressParser([])).to.throw()
  })

  it('parses progress with one step', () => {

    const parser = new StepProgressParser([
      { title: 'remote: Compressing objects', weight: 1 },
    ])

    expect(parser.parse('remote: Compressing objects:  72% (16/22)'))
      .to.have.property('percent', 16 / 22)
  })

  it('parses progress with several steps', () => {

    const parser = new StepProgressParser([
      { title: 'remote: Compressing objects', weight: 0.5 },
      { title: 'Receiving objects', weight: 0.5 },
    ])

    let result

    result = parser.parse('remote: Compressing objects:  72% (16/22)')

    expect(result.kind).to.equal('progress')
    expect((result as ICombinedProgress).percent).to.equal(16 / 22 / 2)

    result = parser.parse('Receiving objects:  99% (166741/167587), 267.24 MiB | 2.40 MiB/s')

    expect(result.kind).to.equal('progress')
    expect((result as ICombinedProgress).percent).to.equal(0.5 + (166741 / 167587 / 2))
  })

  it('enforces ordering of steps', () => {

    const parser = new StepProgressParser([
      { title: 'remote: Compressing objects', weight: 0.5 },
      { title: 'Receiving objects', weight: 0.5 },
    ])

    let result

    result = parser.parse('remote: Compressing objects:  72% (16/22)')

    expect(result.kind).to.equal('progress')
    expect((result as ICombinedProgress).percent).to.equal(16 / 22 / 2)

    result = parser.parse('Receiving objects:  99% (166741/167587), 267.24 MiB | 2.40 MiB/s')

    expect(result.kind).to.equal('progress')
    expect((result as ICombinedProgress).percent).to.equal(0.5 + (166741 / 167587 / 2))

    result = parser.parse('remote: Compressing objects:  72% (16/22)')

    expect(result.kind).to.equal('context')
  })
})
