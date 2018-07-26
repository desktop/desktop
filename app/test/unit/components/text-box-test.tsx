import * as React from 'react'
import { expect } from 'chai'

import { render, cleanup } from 'react-testing-library'

import { TextBox } from '../../../src/ui/lib/text-box'

describe.only('<TextBox />', () => {
  afterEach(cleanup)

  it('assigns the value to an input', () => {
    const { container } = render(<TextBox value="words are here" />)

    const inputs = container.getElementsByTagName('input')
    expect(inputs.length).equals(1)
    const input = inputs[0]
    expect(input.value).equals('words are here')
  })

  it('updates the value when re-rendered', () => {
    const { rerender, container } = render(<TextBox value="first" />)

    let inputs = container.getElementsByTagName('input')
    expect(inputs[0].value).equals('first')

    rerender(<TextBox value="second" />)

    inputs = container.getElementsByTagName('input')
    expect(inputs[0].value).equals('second')
  })

  it('does not render a label by default', () => {
    const { container } = render(<TextBox value="words are here" />)

    const inputs = container.getElementsByTagName('label')
    expect(inputs.length).equals(0)
  })

  it('renders a label if the label prop is defined', () => {
    const { getByLabelText, container } = render(
      <TextBox label="my cool label" />
    )

    expect(getByLabelText('my cool label')).is.not.null

    const inputs = container.getElementsByTagName('input')
    expect(inputs.length).equals(1)
    const input = inputs[0]
    expect(input.id).contains('my_cool_label')
  })
})
