import * as React from 'react'
import { DialogContent } from '../dialog'
import {
  getExperimentalFeatures,
  IExperimentalFeature,
  enableExperimentalFeature,
  disableExperimentalFeature,
} from '../../lib/experimental-features'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

export class Experimental extends React.Component<{}> {
  public render() {
    return (
      <DialogContent>
        <div className="experimental-section">
          {getExperimentalFeatures().map(feature => (
            <FeatureCheckbox key={feature.id} feature={feature} />
          ))}
        </div>
      </DialogContent>
    )
  }
}

class FeatureCheckbox extends React.Component<{
  feature: IExperimentalFeature
}> {
  public render() {
    return (
      <>
        <Checkbox
          label={this.props.feature.title}
          value={
            this.props.feature.enabled ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onChange}
        />
        <p className="description">{this.props.feature.description}</p>
      </>
    )
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    if (event.currentTarget.checked) {
      enableExperimentalFeature(this.props.feature.id)
    } else {
      disableExperimentalFeature(this.props.feature.id)
    }
  }
}
