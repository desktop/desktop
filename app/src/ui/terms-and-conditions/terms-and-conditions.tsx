import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'

interface ITermsAndConditionsProps {
  /** A function called when the dialog is dismissed. */
  readonly onDismissed: () => void
}

const contact = 'https://github.com/contact'
const logos = 'https://github.com/logos'
const privacyStatement =
  'https://help.github.com/articles/github-privacy-statement/'
const license = 'https://creativecommons.org/licenses/by/4.0/'

export class TermsAndConditions extends React.Component<
  ITermsAndConditionsProps,
  {}
> {
  private dialogContainerRef: HTMLDivElement | null = null
  private closeButtonRef: HTMLButtonElement | null = null

  private onDialogContainerRef = (element: HTMLDivElement | null) => {
    this.dialogContainerRef = element
  }

  private onCloseButtonRef = (element: HTMLButtonElement | null) => {
    this.closeButtonRef = element
  }

  public componentDidMount() {
    // When the dialog is mounted it automatically moves focus to the first
    // focusable element which in this case is a link far down in the terms
    // and conditions which will cause the contents to scroll down. We don't
    // want that so let's just reset it.
    if (this.dialogContainerRef) {
      this.dialogContainerRef.scrollTop = 0
    }

    // And let's just move focus to the close button.
    if (this.closeButtonRef) {
      this.closeButtonRef.focus()
    }
  }

  public render() {
    return (
      <Dialog
        id="terms-and-conditions"
        title="GitHub Open Source Applications Terms and Conditions"
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent onRef={this.onDialogContainerRef}>
          <p>
            These GitHub Open Source Applications Terms and Conditions
            ("Application Terms") are a legal agreement between you (either as
            an individual or on behalf of an entity) and GitHub, Inc. regarding
            your use of GitHub's applications, such as GitHub Desktop™ and
            associated documentation ("Software"). These Application Terms apply
            to the executable code version of the Software. Source code for the
            Software is available separately and free of charge under open
            source software license agreements. If you do not agree to all of
            the terms in these Application Terms, do not download, install, use,
            or copy the Software.
          </p>

          <h2>Connecting to GitHub</h2>

          <p>
            If you configure the Software to work with one or more accounts on
            the GitHub.com website or with an instance of GitHub Enterprise,
            your use of the Software will also be governed your applicable
            GitHub.com website Terms of Service and/or the license agreement
            applicable to your instance of GitHub Enterprise ("GitHub Terms").
          </p>

          <p>
            Any use of the Software that violates your applicable GitHub Terms
            will also be a violation of these Application Terms.
          </p>

          <h2>Open Source Licenses and Notices</h2>

          <p>
            The open source license for the Software is included in the "Open
            Source Notices" documentation that is included with the Software.
            That documentation also includes copies of all applicable open
            source licenses.
          </p>

          <p>
            To the extent the terms of the licenses applicable to open source
            components require GitHub to make an offer to provide source code in
            connection with the Software, such offer is hereby made, and you may
            exercise it by contacting GitHub:{' '}
            <LinkButton uri={contact}>contact</LinkButton>.
          </p>

          <p>
            Unless otherwise agreed to in writing with GitHub, your agreement
            with GitHub will always include, at a minimum, these Application
            Terms. Open source software licenses for the Software's source code
            constitute separate written agreements. To the limited extent that
            the open source software licenses expressly supersede these
            Application Terms, the open source licenses govern your agreement
            with GitHub for the use of the Software or specific included
            components of the Software.
          </p>

          <h2>GitHub's Logos</h2>

          <p>
            The license grant included with the Software is not for GitHub's
            trademarks, which include the Software logo designs. GitHub reserves
            all trademark and copyright rights in and to all GitHub trademarks.
            GitHub's logos include, for instance, the stylized designs that
            include "logo" in the file title in the "logos" folder.
          </p>

          <p>
            The names GitHub, GitHub Desktop, GitHub for Mac, GitHub for
            Windows, Atom, the Octocat, and related GitHub logos and/or stylized
            names are trademarks of GitHub. You agree not to display or use
            these trademarks in any manner without GitHub's prior, written
            permission, except as allowed by GitHub's Logos and Usage Policy:{' '}
            <LinkButton uri={logos}>logos</LinkButton>.
          </p>

          <h2>Privacy</h2>

          <p>
            The Software may collect personal information. You may control what
            information the Software collects in the settings panel. If the
            Software does collect personal information on GitHub's behalf,
            GitHub will process that information in accordance with the
            <LinkButton uri={privacyStatement}>
              GitHub Privacy Statement
            </LinkButton>
            .
          </p>

          <h2>Additional Services</h2>

          <h3>Auto-Update Services</h3>

          <p>
            The Software may include an auto-update service ("Service"). If you
            choose to use the Service or you download Software that
            automatically enables the Service, GitHub will automatically update
            the Software when a new version is available.
          </p>

          <h3>Disclaimers and Limitations of Liability</h3>

          <p>
            THE SERVICE IS PROVIDED ON AN "AS IS" BASIS, AND NO WARRANTY, EITHER
            EXPRESS OR IMPLIED, IS GIVEN. YOUR USE OF THE SERVICE IS AT YOUR
            SOLE RISK. GitHub does not warrant that (i) the Service will meet
            your specific requirements; (ii) the Service is fully compatible
            with any particular platform; (iii) your use of the Service will be
            uninterrupted, timely, secure, or error-free; (iv) the results that
            may be obtained from the use of the Service will be accurate or
            reliable; (v) the quality of any products, services, information, or
            other material purchased or obtained by you through the Service will
            meet your expectations; or (vi) any errors in the Service will be
            corrected.
          </p>

          <p>
            YOU EXPRESSLY UNDERSTAND AND AGREE THAT GITHUB SHALL NOT BE LIABLE
            FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR
            EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO, DAMAGES FOR LOSS OF
            PROFITS, GOODWILL, USE, DATA OR OTHER INTANGIBLE LOSSES (EVEN IF
            GITHUB HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES) RELATED
            TO THE SERVICE, including, for example: (i) the use or the inability
            to use the Service; (ii) the cost of procurement of substitute goods
            and services resulting from any goods, data, information or services
            purchased or obtained or messages received or transactions entered
            into through or from the Service; (iii) unauthorized access to or
            alteration of your transmissions or data; (iv) statements or conduct
            of any third-party on the Service; (v) or any other matter relating
            to the Service.
          </p>

          <p>
            GitHub reserves the right at any time and from time to time to
            modify or discontinue, temporarily or permanently, the Service (or
            any part thereof) with or without notice. GitHub shall not be liable
            to you or to any third-party for any price change, suspension or
            discontinuance of the Service.
          </p>

          <h2>Miscellanea</h2>

          <ol>
            <li>
              No Waiver. The failure of GitHub to exercise or enforce any right
              or provision of these Application Terms shall not constitute a
              waiver of such right or provision.
            </li>

            <li>
              Entire Agreement. These Application Terms, together with any
              applicable Privacy Notices, constitutes the entire agreement
              between you and GitHub and governs your use of the Software,
              superseding any prior agreements between you and GitHub
              (including, but not limited to, any prior versions of the
              Application Terms).
            </li>

            <li>
              Governing Law. You agree that these Application Terms and your use
              of the Software are governed under California law and any dispute
              related to the Software must be brought in a tribunal of competent
              jurisdiction located in or near San Francisco, California.
            </li>

            <li>
              Third-Party Packages. The Software supports third-party "Packages"
              which may modify, add, remove, or alter the functionality of the
              Software. These Packages are not covered by these Application
              Terms and may include their own license which governs your use of
              that particular package.
            </li>

            <li>
              No Modifications; Complete Agreement. These Application Terms may
              only be modified by a written amendment signed by an authorized
              representative of GitHub, or by the posting by GitHub of a revised
              version. These Application Terms, together with any applicable
              Open Source Licenses and Notices and GitHub's Privacy Statement,
              represent the complete and exclusive statement of the agreement
              between you and us. These Application Terms supersede any proposal
              or prior agreement oral or written, and any other communications
              between you and GitHub relating to the subject matter of these
              terms.
            </li>

            <li>
              License to GitHub Policies. These Application Terms are licensed
              under the{' '}
              <LinkButton uri={license}>
                Creative Commons Attribution license
              </LinkButton>
              . You may use it freely under the terms of the Creative Commons
              license.
            </li>

            <li>
              Contact Us. Please send any questions about these Application
              Terms to <LinkButton uri={contact}>support@github.com</LinkButton>
              .
            </li>
          </ol>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" onButtonRef={this.onCloseButtonRef}>
              Close
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
