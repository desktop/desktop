import { expect } from 'chai'

import { match } from '../../src/lib/fuzzy-find'
import { getText } from '../../src/ui/lib/filter-list'
describe('fuzzy find', () => {
  const items = [
    {
      id: '300',
      text: ['add fix for ...', 'opened 5 days ago by bob'],
    },
    {
      id: '500',
      text: ['add support', '#4653 opened 3 days ago by damaneice '],
    },
    {
      id: '500',
      text: ['add an awesome feature', '#7564 opened 10 days ago by ... '],
    },
  ]

  it('should find matching item when searching by pull request number', () => {
    const results = match('4653', items, getText)

    expect(results.length).to.equal(1)
    expect(results[0].item['text'].join('')).to.include('4653')
  })

  it('should find matching item when searching by author', () => {
    const results = match('damaneice', items, getText)

    expect(results.length).to.equal(1)
    expect(results[0].item['text'].join('')).to.include('damaneice')
  })

  it('should find matching item when by title', () => {
    const results = match('awesome feature', items, getText)

    expect(results.length).to.equal(1)
    expect(results[0].item['text'].join('')).to.include('awesome feature')
  })

  it('should find nothing', () => {
    const results = match('$%^', items, getText)

    expect(results.length).to.equal(0)
  })
})
