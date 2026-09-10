import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { Default as DefaultShell } from '../../../src/lib/shells'
import { TargetPathArgument } from '../../../src/lib/custom-integration'

let pickedPath: string | null = null
mock.module('../../../src/ui/main-process-proxy', {
  namedExports: {
    showOpenDialog: async () => pickedPath,
  },
})
mock.module('../../../src/lib/feature-flag', {
  namedExports: {
    enableCopilotAppHandoff: () => true,
    enableCustomIntegration: () => false,
  },
})

async function getIntegrations() {
  return (await import('../../../src/ui/preferences/integrations')).Integrations
}

afterEach(() => {
  pickedPath = null
})

describe('Integrations preferences', () => {
  it('configures and links to the GitHub Copilot app', async () => {
    const Integrations = await getIntegrations()
    const paths: string[] = []
    render(
      <Integrations
        availableEditors={[]}
        selectedExternalEditor={null}
        availableShells={[]}
        selectedShell={DefaultShell}
        useCustomEditor={false}
        customEditor={{ path: '', arguments: TargetPathArgument }}
        useCustomShell={false}
        customShell={{ path: '', arguments: TargetPathArgument }}
        copilotAppPath="/Applications/GitHub Copilot.app"
        onSelectedEditorChanged={() => {}}
        onSelectedShellChanged={() => {}}
        onUseCustomEditorChanged={() => {}}
        onCustomEditorChanged={() => {}}
        onUseCustomShellChanged={() => {}}
        onCustomShellChanged={() => {}}
        onCopilotAppPathChanged={path => paths.push(path)}
      />
    )

    assert.strictEqual(
      screen
        .getByRole('link', {
          name: 'Learn more about GitHub Copilot',
          hidden: true,
        })
        .getAttribute('href'),
      'https://gh.io/app'
    )
    assert.ok(
      screen.getByDisplayValue('/Applications/GitHub Copilot.app', {
        exact: true,
      })
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: 'App location', hidden: true }),
      { target: { value: '/custom/GitHub Copilot.app' } }
    )
    assert.deepStrictEqual(paths, ['/custom/GitHub Copilot.app'])
  })

  it('uses the selected app path from the file picker', async () => {
    const Integrations = await getIntegrations()
    pickedPath = '/chosen/GitHub Copilot.app'
    const paths: string[] = []
    render(
      <Integrations
        availableEditors={[]}
        selectedExternalEditor={null}
        availableShells={[]}
        selectedShell={DefaultShell}
        useCustomEditor={false}
        customEditor={{ path: '', arguments: TargetPathArgument }}
        useCustomShell={false}
        customShell={{ path: '', arguments: TargetPathArgument }}
        copilotAppPath=""
        onSelectedEditorChanged={() => {}}
        onSelectedShellChanged={() => {}}
        onUseCustomEditorChanged={() => {}}
        onCustomEditorChanged={() => {}}
        onUseCustomShellChanged={() => {}}
        onCustomShellChanged={() => {}}
        onCopilotAppPathChanged={path => paths.push(path)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose…' }))

    await waitFor(() =>
      assert.deepStrictEqual(paths, ['/chosen/GitHub Copilot.app'])
    )
  })

  it('shows a platform-specific placeholder when discovery found no app', async () => {
    const Integrations = await getIntegrations()
    render(
      <Integrations
        availableEditors={[]}
        selectedExternalEditor={null}
        availableShells={[]}
        selectedShell={DefaultShell}
        useCustomEditor={false}
        customEditor={{ path: '', arguments: TargetPathArgument }}
        useCustomShell={false}
        customShell={{ path: '', arguments: TargetPathArgument }}
        copilotAppPath=""
        onSelectedEditorChanged={() => {}}
        onSelectedShellChanged={() => {}}
        onUseCustomEditorChanged={() => {}}
        onCustomEditorChanged={() => {}}
        onUseCustomShellChanged={() => {}}
        onCustomShellChanged={() => {}}
        onCopilotAppPathChanged={() => {}}
      />
    )

    assert.strictEqual(
      screen
        .getByRole('textbox', { name: 'App location', hidden: true })
        .getAttribute('placeholder'),
      __DARWIN__ ? 'path to GitHub Copilot.app' : 'path to github.exe'
    )
  })

  it('shows a validation error for the configured path', async () => {
    const Integrations = await getIntegrations()
    render(
      <Integrations
        availableEditors={[]}
        selectedExternalEditor={null}
        availableShells={[]}
        selectedShell={DefaultShell}
        useCustomEditor={false}
        customEditor={{ path: '', arguments: TargetPathArgument }}
        useCustomShell={false}
        customShell={{ path: '', arguments: TargetPathArgument }}
        copilotAppPath="/missing"
        copilotAppPathError="Choose the GitHub Copilot application (.app)."
        onSelectedEditorChanged={() => {}}
        onSelectedShellChanged={() => {}}
        onUseCustomEditorChanged={() => {}}
        onCustomEditorChanged={() => {}}
        onUseCustomShellChanged={() => {}}
        onCustomShellChanged={() => {}}
        onCopilotAppPathChanged={() => {}}
      />
    )

    assert.strictEqual(
      screen.getAllByText('Choose the GitHub Copilot application (.app).')
        .length,
      2
    )
  })
})
