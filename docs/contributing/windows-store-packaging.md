# Windows Store (MSIX) Packaging

Desktop can be packaged as an MSIX for distribution through the Microsoft
Store. This is separate from the existing Squirrel.Windows installer and does
not replace it.

## Prerequisites

- Windows 10 or later
- Windows 10 SDK (the `MakeAppx.exe` tool is required)
- Node.js and yarn (same versions as the rest of the project)

If you have Visual Studio installed, the SDK is likely already present. The
script looks for `MakeAppx.exe` under
`C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\`. You can also
point to a custom location by setting the `MAKEAPPX_PATH` environment variable.

## Building the MSIX locally

First, build the production app (this is the same step used for the normal
Squirrel packaging):

```shellsession
$ yarn build:prod
```

Then run the MSIX packaging script:

```shellsession
$ ts-node -P script/tsconfig.json script/package-msix.ts
```

The output `.msix` file is written to the `dist/` directory, named like
`GitHubDesktop-x64.msix`.

The publisher identity in the manifest defaults to `CN=YOURNAME`. To use a
real publisher identity, set the `MSIX_PUBLISHER` environment variable before
running the script:

```shellsession
$ $env:MSIX_PUBLISHER = "CN=Your Company, O=Your Company, L=City, S=State, C=US"
$ ts-node -P script/tsconfig.json script/package-msix.ts
```

## CI

The MSIX build has its own workflow at `.github/workflows/msix.yml`. It only
runs on manual `workflow_dispatch` triggers or when a tag matching `msix-v*`
is pushed. It does not run on regular PRs or pushes to `development`, and it
does not affect the main CI workflow.

To trigger it manually, go to the Actions tab, select the "Package MSIX"
workflow, and click "Run workflow".

## What is still needed for a real Store submission

The MSIX produced by this script is unsigned and uses a placeholder publisher
identity (`CN=YOURNAME`) by default. Set the `MSIX_PUBLISHER` environment
variable to override this. Before submitting to the Microsoft Store, the
following manual steps are required:

1. **Signing certificate**: Obtain a code-signing certificate whose subject
   matches the publisher identity registered in Partner Center. Sign the MSIX
   using `SignTool` from the Windows SDK:

   ```
   SignTool sign /fd SHA256 /a /f cert.pfx /p <password> dist\GitHubDesktop-x64.msix
   ```

2. **Partner Center account**: Register the app in
   [Partner Center](https://partner.microsoft.com/dashboard) and reserve the
   app name. Update the `Identity` and `Publisher` fields in
   `script/windows-store-assets/AppxManifest.xml` to match.

3. **Store visual assets**: The manifest currently references existing app
   icons as placeholders. A real submission needs properly sized tile images
   (Square44x44, Square150x150, Wide310x150, etc.) placed in the package.

4. **Upload**: Submit the signed MSIX through Partner Center or using the
   Store submission API.

These steps are intentionally left as manual/future work and are not automated
by this PR.
