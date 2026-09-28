import * as React from 'react'

import { Repository } from '../../models/repository'
import {
  CustomCommandScope,
  ICustomCommand,
  getCustomCommandsValidationError,
} from '../../lib/custom-command'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { TextArea } from '../lib/text-area'

interface ICustomCommandDialogProps {
  readonly repository: Repository
  readonly scope: CustomCommandScope
  readonly dispatcher: Pick<
    Dispatcher,
    'saveCustomCommands' | 'importCustomCommands' | 'exportCustomCommands'
  >
  readonly initialCommands: ReadonlyArray<ICustomCommand>
  readonly onDismissed: () => void
}

/** Edit a local command list without executing any of its entries. */
export function CustomCommandDialog(props: ICustomCommandDialogProps) {
  const [commands, setCommands] = React.useState(props.initialCommands)
  const [selectedId, setSelectedId] = React.useState(
    props.initialCommands[0]?.id ?? ''
  )
  const [busy, setBusy] = React.useState(false)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [fileStatus, setFileStatus] = React.useState<string | null>(null)
  const selected = commands.find(c => c.id === selectedId)
  const validationError = getCustomCommandsValidationError(commands)

  const onSelected = React.useCallback(
    (event: React.FormEvent<HTMLSelectElement>) => {
      setSelectedId(event.currentTarget.value)
    },
    []
  )

  const onAdd = React.useCallback(() => {
    const command: ICustomCommand = {
      id: crypto.randomUUID(),
      name: '',
      command: '',
    }
    setCommands(current => [...current, command])
    setSelectedId(command.id)
  }, [])

  const onRemove = React.useCallback(() => {
    const remaining = commands.filter(c => c.id !== selectedId)
    setCommands(remaining)
    setSelectedId(remaining[0]?.id ?? '')
  }, [commands, selectedId])

  const onNameChanged = React.useCallback(
    (name: string) => {
      setCommands(current =>
        current.map(c => (c.id === selectedId ? { ...c, name } : c))
      )
    },
    [selectedId]
  )

  const onCommandChanged = React.useCallback(
    (command: string) => {
      setCommands(current =>
        current.map(c => (c.id === selectedId ? { ...c, command } : c))
      )
    },
    [selectedId]
  )

  const onSave = React.useCallback(async () => {
    if (busy || validationError !== null) {
      return
    }
    setBusy(true)
    const success = await props.dispatcher.saveCustomCommands(
      props.repository,
      commands,
      props.scope
    )
    setBusy(false)
    if (success) {
      props.onDismissed()
    }
  }, [busy, commands, props, validationError])

  const onImport = React.useCallback(async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setFileError(null)
    setFileStatus(null)
    try {
      const imported = await props.dispatcher.importCustomCommands(commands)
      if (imported !== null) {
        const count = imported.length - commands.length
        setCommands(imported)
        setSelectedId(imported[commands.length]?.id ?? selectedId)
        setFileStatus(
          `Imported ${count} ${
            count === 1 ? 'command' : 'commands'
          } into this draft. Review the scripts, then choose Save to keep them.`
        )
      }
    } catch (error) {
      setFileError(
        `Could not import commands: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      setBusy(false)
    }
  }, [busy, commands, props.dispatcher, selectedId])

  const exportCommands = React.useCallback(
    async (exported: ReadonlyArray<ICustomCommand>) => {
      if (busy) {
        return
      }
      setBusy(true)
      setFileError(null)
      setFileStatus(null)
      try {
        if (await props.dispatcher.exportCustomCommands(exported)) {
          setFileStatus(
            `Exported ${exported.length} ${
              exported.length === 1 ? 'command' : 'commands'
            }.`
          )
        }
      } catch (error) {
        setFileError(
          `Could not export commands: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      } finally {
        setBusy(false)
      }
    },
    [busy, props.dispatcher]
  )

  const onExportSelected = React.useCallback(
    () => (selected === undefined ? undefined : exportCommands([selected])),
    [exportCommands, selected]
  )

  const onExportAll = React.useCallback(
    () => exportCommands(commands),
    [commands, exportCommands]
  )

  return (
    <Dialog
      id="custom-command"
      title={
        props.scope === 'global'
          ? 'Configure global commands'
          : 'Configure repository commands'
      }
      onSubmit={onSave}
      onDismissed={props.onDismissed}
      loading={busy}
      dismissDisabled={busy}
    >
      <DialogContent>
        <p>
          {props.scope === 'global'
            ? 'Global commands are available in every repository.'
            : 'Repository commands are only available in this checkout.'}
        </p>
        <p>
          Working directory: <code>{props.repository.path}</code>
        </p>
        <Select
          label="Commands"
          value={selectedId}
          onChange={onSelected}
          disabled={busy || commands.length === 0}
        >
          {commands.length === 0 && (
            <option value="">No commands configured</option>
          )}
          {commands.map(c => (
            <option key={c.id} value={c.id}>
              {c.name || 'Untitled command'}
            </option>
          ))}
        </Select>
        <div className="button-group">
          <Button type="button" onClick={onAdd} disabled={busy}>
            Add command
          </Button>
          <Button
            type="button"
            onClick={onRemove}
            disabled={busy || selected === undefined}
          >
            Remove command
          </Button>
        </div>
        <div className="button-group">
          <Button type="button" onClick={onImport} disabled={busy}>
            Import...
          </Button>
          <Button
            type="button"
            onClick={onExportSelected}
            disabled={
              busy ||
              selected === undefined ||
              getCustomCommandsValidationError([selected]) !== null
            }
          >
            Export selected...
          </Button>
          <Button
            type="button"
            onClick={onExportAll}
            disabled={busy || commands.length === 0 || validationError !== null}
          >
            Export all...
          </Button>
        </div>
        {selected !== undefined && (
          <>
            <TextBox
              label="Name"
              value={selected.name}
              onValueChanged={onNameChanged}
              disabled={busy}
              placeholder="Build"
            />
            <TextArea
              label="PowerShell command"
              value={selected.command}
              onValueChanged={onCommandChanged}
              rows={5}
              disabled={busy}
              placeholder="npm run build"
            />
          </>
        )}
        {validationError !== null && <p role="alert">{validationError}</p>}
        {fileError !== null && <p role="alert">{fileError}</p>}
        {fileStatus !== null && <p role="status">{fileStatus}</p>}
        <p>
          Imports are added to this group without overwriting existing commands.
          Conflicting names get a numbered suffix. Review imported scripts
          before saving; importing never runs them.
        </p>
        <p>
          Save this list, then select a command from the toolbar menu to run it
          in this checkout. An in-app panel shows live output and the result,
          with a Stop command button while it is running.
        </p>
        <p>
          Only run commands you trust. They run with your Windows permissions.
          Commands are saved only on this computer, not in Git. Do not store
          secrets here. Exported files contain the full script text, including
          any hard-coded paths or secrets. Check them before sharing.
        </p>
      </DialogContent>
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Save"
          okButtonDisabled={busy || validationError !== null}
          cancelButtonDisabled={busy}
        />
      </DialogFooter>
    </Dialog>
  )
}
