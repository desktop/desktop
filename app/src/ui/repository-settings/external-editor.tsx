import * as React from 'react'
import { DialogContent } from '../dialog'
import { Row } from '../lib/row'
import { RadioGroup } from '../lib/radio-group'
import { Select } from '../lib/select'

type EditorChoice = 'inherit' | 'specific'

interface IExternalEditorProps {
  readonly availableEditors: ReadonlyArray<string>
  readonly choice: EditorChoice
  readonly selection: string | null
  readonly globalLabel: string | null
  readonly onChoiceChanged: (choice: EditorChoice) => void
  readonly onSelectionChanged: (editor: string) => void
}

function renderLabels(globalLabel: string | null) {
  return function renderRadioLabel(key: EditorChoice): string {
    return key === 'inherit'
      ? `Use my global default`
      : 'Use a specific editor for this repository'
  }
}

function onSelectChange(onSelectionChanged: (editor: string) => void) {
  return function onSelectChange(
    event: React.FormEvent<HTMLSelectElement>
  ): void {
    onSelectionChanged(event.currentTarget.value)
  }
}

export function ExternalEditor(props: IExternalEditorProps) {
  const {
    availableEditors,
    choice,
    selection,
    globalLabel,
    onChoiceChanged,
    onSelectionChanged,
  } = props

  const renderRadioLabel = renderLabels(globalLabel)
  const handleSelectChange = onSelectChange(onSelectionChanged)
  const selectDisabled = choice !== 'specific'

  return (
    <DialogContent>
      <div className="advanced-section">
        <h2 id="external-editor-heading">External editor</h2>
        <Row>
          <RadioGroup<EditorChoice>
            ariaLabelledBy="external-editor-heading"
            selectedKey={choice}
            radioButtonKeys={['inherit', 'specific']}
            onSelectionChanged={onChoiceChanged}
            renderRadioButtonLabelContents={renderRadioLabel}
          />
        </Row>
        <Row>
          <Select
            aria-label="External editor for this repository"
            value={selection ?? undefined}
            onChange={handleSelectChange}
            disabled={selectDisabled}
          >
            {availableEditors.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Row>
      </div>
    </DialogContent>
  )
}
