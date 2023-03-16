# Developer OAuth App

Because GitHub Desktop uses [OAuth web application flow](https://developer.github.com/v3/oauth/#web-application-flow)
to interact with the GitHub API and perform actions on behalf of a user, it
needs to be bundled with a Client ID and Secret.

For external contributors, we have bundled a developer OAuth application
with the Desktop application so that you can complete the sign in flow locally
without needing to configure your own application.

These are listed in [app/app-info.ts](https://github.com/desktop/desktop/blob/85cf9dbae5055cc4f0de9fb4f7046cd32607e877/app/app-info.ts#L9-L10).

**DO NOT TRUST THIS CLIENT ID AND SECRET! THIS IS ONLY FOR TESTING PURPOSES!!**

The limitation with this developer application is that **this will not work
with GitHub Enterprise**. You will see  sign-in will fail on the OAuth callback
due to the credentials not being present there.

## Provide your own Client ID and Secret

The OAuth client ID and Client Secret are bundled into the application with
webpack. If you want to provide your own Client ID and Client Secret, set these
environment variables:

 - `DESKTOP_OAUTH_CLIENT_ID`
 - `DESKTOP_OAUTH_CLIENT_SECRET`
