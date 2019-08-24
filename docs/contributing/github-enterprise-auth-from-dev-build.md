# Authenticating GitHub Enterprise from a Desktop-dev Build

So you want to do some testing using GitHub Enterprise in your dev build of GitHub Desktop... here's how!

1. Find or create an organization on the GHE instance that you are an owner of
1. [Create a new OAuth app](https://developer.github.com/apps/building-oauth-apps/creating-an-oauth-app/) in the organization. Input `x-github-client://oauth` as the authorization callback URL:
   <img width="558" alt="New_OAuth_Application" src="https://user-images.githubusercontent.com/7910250/63631725-2ffd8200-c5e0-11e9-92e4-b2e5b61d9c89.png">
1. Insert the Client ID and Client Secret into the [`app-info.ts` file](https://github.com/desktop/desktop/blob/e3991a8c73ab10ca12fcad23f7e367707051d985/app/app-info.ts#L28-L31)
1. Build the app
1. Go to "Preferences", click the "Accounts" tab, and sign into GitHub Enterprise Server. Click "Continue With Browser" to proceed with the OAuth flow
1. Try publishing a new repository using Desktop-dev for the organization associated with the new OAuth app
1. Celebrate and go about your day :vulcan_salute:
