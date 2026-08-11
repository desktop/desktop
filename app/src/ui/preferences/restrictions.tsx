import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IRestrictionsPreferencesProps {
  readonly preventRepositoryRemoval: boolean
  readonly onPreventRepositoryRemovalChanged: (value: boolean) => void
}

export class Restrictions extends React.Component<
  IRestrictionsPreferencesProps,
  {}
> {
  public render() {
    return (
      <DialogContent>
        <div className="restrictions-section">
          <h2>Repository actions</h2>
          <Checkbox
            label="Prevent repository removal"
            value={
              this.props.preventRepositoryRemoval
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onPreventRepositoryRemovalChanged}
            ariaDescribedBy="prevent-repository-removal-description"
          />
          <p
            id="prevent-repository-removal-description"
            className="settings-description"
          >
            Blocks removing repositories from GitHub Desktop and moving their
            folders to Trash. Return here and turn this restriction off before
            removing a repository.
          </p>
        </div>
      </DialogContent>
    )
  }

  private onPreventRepositoryRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onPreventRepositoryRemovalChanged(event.currentTarget.checked)
  }
}
