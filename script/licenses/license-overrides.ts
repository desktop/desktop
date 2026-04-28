import { LicenseLookup } from 'legal-eagle'
import { readFileSync } from 'fs'
import { join } from 'path'

export const copilotCLILicenseName = 'GitHub-CLI-1.0.0'

const copilotCLIPkgPath = join(
  __dirname,
  '..',
  '..',
  'app',
  'node_modules',
  '@github',
  'copilot',
  'package.json'
)
const copilotCLIVersion = JSON.parse(readFileSync(copilotCLIPkgPath, 'utf8'))
  .version as string
const copilotCLILicense = `GitHub Copilot CLI License

1. License Grant
Subject to the terms of this License, GitHub grants you a non‑exclusive, non‑transferable, royalty‑free license to install and run copies of the GitHub Copilot CLI (the “Software”). Subject to Section 2 below, GitHub also grants you the right to reproduce and redistribute unmodified copies of the Software as part of an application or service.

2. Redistribution Rights and Conditions
You may reproduce and redistribute the Software only in accordance with all of the following conditions:
The Software is distributed only in unmodified form;
The Software is redistributed solely as part of an application or service that provides material functionality beyond the Software itself;
The Software is not distributed on a standalone basis or as a primary product;
You include a copy of this License and retain all applicable copyright, trademark, and attribution notices; and
Your application or service is licensed independently of the Software.
Nothing in this License restricts your choice of license for your application or service, including distribution under an open source license. This License applies solely to the Software and does not modify or supersede the license terms governing your application or its source code.

3. Scope Limitations
This License does not grant you the right to:
Modify, adapt, translate, or create derivative works of the Software;
Redistribute the Software except as expressly permitted in Section 2;
Remove, alter, or obscure any proprietary notices included in the Software; or
Use GitHub trademarks, logos, or branding except as necessary to identify the Software.

4. Reservation of Rights
GitHub and its licensors retain all right, title, and interest in and to the Software. All rights not expressly granted by this License are reserved.

5. Disclaimer of Warranty
THE SOFTWARE IS PROVIDED “AS IS,” WITHOUT WARRANTY OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON‑INFRINGEMENT. THE ENTIRE RISK ARISING OUT OF USE OF THE SOFTWARE REMAINS WITH YOU.

6. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL GITHUB OR ITS LICENSORS BE LIABLE FOR ANY DAMAGES ARISING OUT OF OR RELATING TO THIS LICENSE OR THE USE OR DISTRIBUTION OF THE SOFTWARE, WHETHER IN CONTRACT, TORT, OR OTHERWISE.

7. Termination
This License terminates automatically if you fail to comply with its terms. Upon termination, you must cease all use and distribution of the Software.

8. Notice Regarding GitHub Services (Informational Only)
Use of the Software may require access to GitHub services and is subject to the applicable GitHub Terms of Service and GitHub Copilot terms. This License governs only rights related to the Software and does not grant any rights to access or use GitHub services.
`

const copilotCLILicenseEntry = {
  license: copilotCLILicenseName,
  source:
    'LICENSE.md file at https://github.com/github/copilot-cli/blob/8218a021346fb655cd88e13c60d7e92f0f4c33fb/LICENSE.md',
  sourceText: copilotCLILicense,
  repository: 'git+https://github.com/github/copilot-cli',
}

const copilotCLILicenseEntries: LicenseLookup = {
  [`@github/copilot@${copilotCLIVersion}`]: copilotCLILicenseEntry,
}

const platforms = ['darwin', 'linux', 'win32']
const architectures = ['arm64', 'x64']

for (const platform of platforms) {
  for (const architecture of architectures) {
    const key = `@github/copilot-${platform}-${architecture}@${copilotCLIVersion}`
    copilotCLILicenseEntries[key] = copilotCLILicenseEntry
  }
}

export const licenseOverrides: LicenseLookup = {
  ...copilotCLILicenseEntries,
}
