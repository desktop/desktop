import { Entry, LicenseLookup } from 'legal-eagle'

const tslibLicenseOverride: Entry = {
  repository: 'git+https://github.com/microsoft/tslib',
  license: 'BSD',
  source:
    'https://github.com/microsoft/tslib/blob/74f1ff794985b33657b599b611e82937e3074617/LICENSE.txt',
  sourceText: `Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`,
}

export const licenseOverrides: LicenseLookup = {
  'cycle@1.0.3': {
    repository: 'git+ssh://git@github.com/dscape/cycle',
    license: 'Public Domain',
    source:
      'cycle.js header comment at https://github.com/dscape/cycle/blob/ab67ce90e8fa2efdb8f21074661366ec56f6a724/cycle.js',
    sourceText:
      'Public Domain.\n\nNO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.',
  },

  'json-schema@0.2.3': {
    repository: 'git+ssh://git@github.com/kriszyp/json-schema',
    license: 'BSD',
    source:
      'README.md at https://github.com/kriszyp/json-schema/tree/24c4ed1b2359ab457a00e90606a777c2962ecd3b',
    sourceText:
      'Code is licensed under the AFL or BSD 3-Clause license as part of the Persevere project which is administered under the Dojo foundation, and all contributions require a Dojo CLA.',
  },

  'tslib@2.0.0': tslibLicenseOverride,
  'tslib@2.3.1': tslibLicenseOverride,
}
