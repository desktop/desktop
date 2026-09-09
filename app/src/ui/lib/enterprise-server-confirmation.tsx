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
    <>
      <p>Git is requesting that you sign in to this server:</p>
      <p>
        <Ref>{getHTMLURL(endpoint)}</Ref>
      </p>
      <p>
        You are not signed in to this server. Only continue if you recognize and
        trust it. If you are unsure, cancel and check with your repository
        administrator.
      </p>
    </>
  )
}
