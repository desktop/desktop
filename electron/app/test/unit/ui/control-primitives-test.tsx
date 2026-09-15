import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Button } from '../../../src/ui/lib/button'
import { Checkbox, CheckboxValue } from '../../../src/ui/lib/checkbox'
import { RadioButton } from '../../../src/ui/lib/radio-button'
import { RadioGroup } from '../../../src/ui/lib/radio-group'
import { Select } from '../../../src/ui/lib/select'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('control primitives', () => {
  it('renders enabled buttons with forwarded refs, classes, and aria attributes', () => {
    let clicked = 0
    let menuOpened = 0
    let hovered = 0
    let buttonRef: HTMLButtonElement | null = null

    function onClick() {
      clicked++
    }

    function onContextMenu() {
      menuOpened++
    }

    function onMouseEnter() {
      hovered++
    }

    function onButtonRef(instance: HTMLButtonElement | null) {
      buttonRef = instance
    }

    render(
      <Button
        className="launch-button"
        size="small"
        role="switch"
        ariaExpanded={true}
        ariaHaspopup="menu"
        ariaPressed={true}
        ariaControls="details-panel"
        ariaLabel="Launch"
        ariaDescribedBy="launch-help"
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onButtonRef={onButtonRef}
      >
        Open
      </Button>
    )

    const button = screen.getByRole('switch', { name: 'Launch' })

    assert.equal(buttonRef, button)
    assert.ok(button.classList.contains('button-component'))
    assert.ok(button.classList.contains('launch-button'))
    assert.ok(button.classList.contains('small-button'))
    assert.equal(button.getAttribute('aria-expanded'), 'true')
    assert.equal(button.getAttribute('aria-haspopup'), 'menu')
    assert.equal(button.getAttribute('aria-pressed'), 'true')
    assert.equal(button.getAttribute('aria-controls'), 'details-panel')
    assert.equal(button.getAttribute('aria-describedby'), 'launch-help')
    assert.equal(fireEvent.click(button), false)
    fireEvent.contextMenu(button)
    fireEvent.mouseEnter(button)

    assert.equal(clicked, 1)
    assert.equal(menuOpened, 1)
    assert.equal(hovered, 1)
  })

  it('prevents disabled button interactions and exposes aria-disabled', () => {
    let clicked = 0
    let menuOpened = 0
    let hovered = 0

    function onClick() {
      clicked++
    }

    function onContextMenu() {
      menuOpened++
    }

    function onMouseEnter() {
      hovered++
    }

    render(
      <Button
        disabled={true}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
      >
        Disabled action
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Disabled action' })

    assert.equal(button.getAttribute('aria-disabled'), 'true')
    assert.equal(fireEvent.click(button), false)
    fireEvent.contextMenu(button)
    fireEvent.mouseEnter(button)

    assert.equal(clicked, 0)
    assert.equal(menuOpened, 0)
    assert.equal(hovered, 0)
  })

  it('renders checkbox labels, mixed state, and change wiring', () => {
    let changed = 0

    function onChange() {
      changed++
    }

    const view = render(
      <Checkbox
        label="Enable feature"
        value={CheckboxValue.Mixed}
        onChange={onChange}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'Enable feature',
    }) as HTMLInputElement

    assert.equal(checkbox.checked, true)
    assert.equal(checkbox.indeterminate, true)

    fireEvent.click(checkbox)

    assert.equal(changed, 1)

    view.rerender(
      <Checkbox
        label="Enable feature"
        value={CheckboxValue.Off}
        onChange={onChange}
      />
    )

    assert.equal(checkbox.checked, false)
    assert.equal(checkbox.indeterminate, false)
  })

  it('keeps checkbox double clicks from bubbling to ancestor handlers', () => {
    let parentDoubleClicks = 0

    function onParentDoubleClick() {
      parentDoubleClicks++
    }

    render(
      <div onDoubleClick={onParentDoubleClick}>
        <Checkbox label="Stage file" value={CheckboxValue.On} />
      </div>
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Stage file' })

    fireEvent.doubleClick(checkbox)

    assert.equal(parentDoubleClicks, 0)
  })

  it('renders radio buttons and forwards selection plus double-click values', () => {
    const selections: Array<React.Key> = []
    const doubleClicks: Array<React.Key> = []

    function onSelected(value: React.Key) {
      selections.push(value)
    }

    function onDoubleClick(value: React.Key) {
      doubleClicks.push(value)
    }

    render(
      <RadioButton
        checked={false}
        value="stash"
        tabIndex={0}
        onSelected={onSelected}
        onDoubleClick={onDoubleClick}
      >
        Stash changes
      </RadioButton>
    )

    const radio = screen.getByRole('radio', { name: 'Stash changes' })
    const label = radio.closest('label')

    assert.equal(radio.getAttribute('tabindex'), '0')
    assert.equal((radio as HTMLInputElement).checked, false)

    fireEvent.click(radio)
    fireEvent.doubleClick(label ?? radio)

    assert.deepEqual(selections, ['stash'])
    assert.deepEqual(doubleClicks, ['stash'])
  })

  it('renders radio groups with one tabbable selected option and selection callbacks', () => {
    const selectedKeys: Array<React.Key> = []

    function onSelectionChanged(key: React.Key) {
      selectedKeys.push(key)
    }

    function renderLabel(key: React.Key) {
      return key === 'ask' ? 'Ask every time' : 'Move changes'
    }

    render(
      <RadioGroup
        ariaLabelledBy="switch-heading"
        selectedKey="ask"
        radioButtonKeys={['ask', 'move']}
        onSelectionChanged={onSelectionChanged}
        renderRadioButtonLabelContents={renderLabel}
      />
    )

    const group = screen.getByRole('radiogroup')
    const ask = screen.getByRole('radio', { name: 'Ask every time' })
    const move = screen.getByRole('radio', { name: 'Move changes' })

    assert.equal(group.getAttribute('aria-labelledby'), 'switch-heading')
    assert.equal(ask.getAttribute('tabindex'), '0')
    assert.equal(move.getAttribute('tabindex'), '-1')

    fireEvent.click(move)

    assert.deepEqual(selectedKeys, ['move'])
  })

  it('renders selects with associated labels and change callbacks', () => {
    const changed: Array<string> = []

    function onChange(event: React.FormEvent<HTMLSelectElement>) {
      changed.push(event.currentTarget.value)
    }

    render(
      <Select label="Default branch" value="main" onChange={onChange}>
        <option value="main">main</option>
        <option value="release">release</option>
      </Select>
    )

    const select = screen.getByRole('combobox', {
      name: 'Default branch',
    }) as HTMLSelectElement

    assert.equal(select.value, 'main')

    fireEvent.change(select, { target: { value: 'release' } })

    assert.deepEqual(changed, ['release'])
  })
})
