import { expect } from 'chai'
import {
  externalContributionRe,
  otherContributionRe,
} from '../../src/models/release-notes'

//todo: test everything

describe('externalContributionRe', () => {
  it.only('Matches messages that addresses one issue', () => {
    //arrange
    const message = 'Hey look at me! - #1234. Thanks @MrMeeSeeks!'

    //act
    const match = externalContributionRe.exec(message)

    //assert
    expect(match).is.not.null
    expect(match![1].trim()).to.equal('Hey look at me! -')
    expect(match![2].trim()).to.equal('#1234')
    expect(match![5]).to.equal('@MrMeeSeeks')
  })

  it.only('Matches messages that address more than one issue', () => {
    //arrange
    const message = 'Hey look at me! - #0 #12 #345 #6789. Thanks @MrMeeseeks!'

    //act
    const match = externalContributionRe.exec(message)

    //assert
    expect(match).is.not.null
    expect(match![1].trim()).to.equal('Hey look at me! -')
    expect(match![2].trim()).to.equal('#0 #12 #345 #6789')
    expect(match![5].trim()).to.equal('@MrMeeseeks')
  })
})

describe('otherContributionRe', () => {
  it.only('Matches messages that addresses no issue', () => {
    //arrange
    const message = 'Just a message'

    //act
    const match = otherContributionRe.exec(message)

    //assert
    expect(match).is.not.null
  })
})
