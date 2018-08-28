import { expect } from 'chai'
import * as React from 'react'

import { join } from '../../src/ui/lib/join'

describe('join', () => {
  it('returns an empty array when the input is an empty array', () => {
    const result = join([], ' ')
    expect(result.length).to.equal(0)
  })

  it('does not add a separator when one element provided', () => {
    const result = join([<span />], ' ')
    expect(result.length).to.equal(1)

    const elem = result[0] as JSX.Element
    expect(elem.type).equals('span')
  })

  it('does not append a trailing separator', () => {
    const result = join([<span>first</span>, <div>second</div>], 'thing')
    expect(result.length).to.equal(3)

    const first = result[0] as JSX.Element
    expect(first.type).equals('span')

    const second = result[1] as string
    expect(second).equals('thing')

    const third = result[2] as JSX.Element
    expect(third.type).equals('div')
  })
})
