import * as React from 'react'
import { render, cleanup, fireEvent } from 'react-testing-library'

import { LinkButton } from '../../src/ui/lib/link-button'

describe('<LinkButton/>', () => {
  afterEach(cleanup)

  it(`renders an element without the link`, () => {
    const { container } = render(<LinkButton>some text goes here</LinkButton>)
    expect(container).toMatchSnapshot()
  })

  it(`renders an element with a link`, () => {
    const { container } = render(
      <LinkButton uri="https://www.google.com/">
        this link contains buttons
      </LinkButton>
    )
    expect(container).toMatchSnapshot()
  })

  it(`can click and trigger callback`, () => {
    const clickEvent = jest.fn()
    const { getByText } = render(
      <LinkButton onClick={clickEvent}>click me</LinkButton>
    )

    fireEvent.click(getByText('click me'))
    expect(clickEvent).toHaveBeenCalledTimes(1)
  })

  it(`does not invoke callback when disabled`, () => {
    const clickEvent = jest.fn()
    const { getByText } = render(
      <LinkButton onClick={clickEvent} disabled={true}>
        click me
      </LinkButton>
    )

    fireEvent.click(getByText('click me'))
    expect(clickEvent).not.toBeCalled()
  })
})
