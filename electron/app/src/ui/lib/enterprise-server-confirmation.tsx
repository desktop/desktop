import * as React from 'react'
import { getHTMLURL } from '../../lib/api'
import { Ref } from './ref'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IEnterpriseServerConfirmationProps {
  readonly endpoint: string
}

export const enterpriseServerConfirmationDescriptionId =
  'enterprise-server-confirmation-description'

/** Explains the destination of an Enterprise sign-in requested by Git. */
export class EnterpriseServerConfirmation extends React.Component<IEnterpriseServerConfirmationProps> {
  public render() {
    return (
      <div
        id={enterpriseServerConfirmationDescriptionId}
        className="enterprise-server-confirmation"
      >
        <p>Git is requesting permission to sign in to this server:</p>
        <p>
          <Ref>{getHTMLURL(this.props.endpoint)}</Ref>
        </p>
        <div className="enterprise-server-warning">
          <Octicon symbol={octicons.alert} />
          <p>
            <strong>
              Only continue if you recognize and trust this server.
            </strong>{' '}
            Confirm this address appears in your browser. Otherwise, cancel and
            contact your repository administrator.
          </p>
        </div>
      </div>
    )
  }
}
