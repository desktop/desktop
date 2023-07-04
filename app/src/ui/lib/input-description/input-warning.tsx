import * as React from 'react'
import {
  IBaseInputDescriptionProps,
  InputDescription,
  InputDescriptionType,
} from './input-description'

/**
 * An Warning component with app-standard styles for warnings to be used with inputs.
 *
 * Provide `children` elements to render as the content for the error element.
 */
export class InputWarning extends React.Component<IBaseInputDescriptionProps> {
  public render() {
    return (
      <InputDescription
        inputDescriptionType={InputDescriptionType.Warning}
        {...this.props}
      >
        {this.props.children}
      </InputDescription>
    )
  }
}
