import * as React from 'react'
import { getHTMLURL } from '../../lib/api'
import { Ref } from './ref'

interface IEnterpriseServerConfirmationProps {
  readonly endpoint: string
}

export const trustEnterpriseServerLabel = __DARWIN__
  ? 'Trust Server'
  : 'Trust server'

/** Explains the destination of an Enterprise sign-in requested by Git. */
export function EnterpriseServerConfirmation({
  endpoint,
}: IEnterpriseServerConfirmationProps) {
  return (
    <div className="enterprise-server-confirmation">
      <p>Git is requesting that you sign in to this server:</p>
      <p>
        <Ref>{getHTMLURL(endpoint)}</Ref>
      </p>
      <ul>
        <li>
          <strong>Recognize this server?</strong> Only continue if you trust it.
        </li>
        <li>
          <strong>Check your browser's address bar.</strong> Before authorizing
          GitHub Desktop, make sure the page is on this server's domain.
        </li>
      </ul>
      <p className="enterprise-sign-in-note">
        Your organization may use a separate sign-in provider. That's normal;
        check the domain when you return to authorize GitHub Desktop.
      </p>
      <p>Not sure? Cancel and check with your repository administrator.</p>
    </div>
  )
}
