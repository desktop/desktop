import * as React from 'react'
import { render, cleanup } from 'react-testing-library'
import * as moment from 'moment'

import { RelativeTime } from '../../src/ui/relative-time'

const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

jest.useFakeTimers()

describe('<RelativeTime/>', () => {
  afterEach(cleanup)

  let realDateNow: () => number

  function mockDateNow(date: Date) {
    const stub = jest.fn(() => date.getTime())
    global.Date.now = stub
    return stub
  }

  beforeEach(() => {
    realDateNow = Date.now.bind(global.Date)
  })

  afterEach(() => {
    global.Date.now = realDateNow
  })

  const testCases = [
    {
      testName: 'same time',
      relativeTime: 0,
      expectedText: 'just now',
    },
    {
      testName: 'less than a minute',
      relativeTime: 10 * SECOND,
      expectedText: 'just now',
    },
    {
      testName: '5 minutes',
      relativeTime: 5 * MINUTE,
      expectedText: '5 minutes ago',
    },
    {
      testName: '9 hours',
      relativeTime: 9 * HOUR,
      expectedText: '9 hours ago',
    },
    {
      testName: '3 days',
      relativeTime: 3 * DAY,
      expectedText: '3 days ago',
    },
  ]

  for (const { testName, relativeTime, expectedText } of testCases) {
    it(`can render a relative time: ${testName}`, () => {
      const date = new Date(realDateNow() - relativeTime)
      const { container } = render(<RelativeTime date={date} />)
      expect(container.textContent).toBe(expectedText)
    })
  }

  it(`renders a very old date in it's absolute form`, () => {
    const fixedDate = new Date('2015-10-03T08:00:00Z')
    mockDateNow(fixedDate)

    const twoDaysAfter = new Date(fixedDate.getTime() - 20 * DAY)
    // this is the short form of the absolute date format
    const expectedText = moment(twoDaysAfter).format('ll')

    const { container } = render(<RelativeTime date={twoDaysAfter} />)
    expect(container.textContent).toBe(expectedText)
  })

  it(`renders a future time in it's absolute form`, () => {
    const fixedDate = new Date('2017-01-03T14:00:00Z')
    mockDateNow(fixedDate)

    const twoDaysAfter = new Date(fixedDate.getTime() + 2 * DAY)
    // this is the longer form of the absolute date format
    const expectedText = moment(twoDaysAfter).format('lll')

    const { container } = render(<RelativeTime date={twoDaysAfter} />)
    expect(container.textContent).toBe(expectedText)
  })

  it(`re-renders when date changed`, () => {
    const fixedDate = new Date('2017-01-03T14:00:00Z')
    mockDateNow(fixedDate)

    const twoDaysAgo = new Date(fixedDate.getTime() - 2 * DAY)

    const { container, rerender } = render(<RelativeTime date={twoDaysAgo} />)
    expect(container.textContent).toBe('2 days ago')

    const sixHoursBefore = new Date(fixedDate.getTime() - 6 * HOUR)
    rerender(<RelativeTime date={sixHoursBefore} />)

    expect(container.textContent).toBe('6 hours ago')
  })

  it('updates after timeout expires', () => {
    const fixedDate = new Date('2017-05-21T05:00:00Z')
    mockDateNow(fixedDate)

    const twoHoursBefore = new Date(
      fixedDate.getTime() - (2 * HOUR + 20 * MINUTE)
    )

    const { container } = render(<RelativeTime date={twoHoursBefore} />)
    expect(container.textContent).toBe('2 hours ago')

    const anHourLater = new Date(fixedDate.getTime() + 1 * HOUR)
    mockDateNow(anHourLater)

    jest.advanceTimersByTime(1 * HOUR)

    expect(container.textContent).toBe('3 hours ago')
  })
})
