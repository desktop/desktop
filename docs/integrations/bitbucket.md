# Authenticating to Bitbucket with GitHub Desktop

## Creating a Personal Access Token in Bitbucket

To authenticate against Bitbucket repositories you will need to create a personal access token.

1. Go to your Bitbucket account and select **Bitbucket settings** in the user profile dropdown.

2. Select **App passwords**

3. Under **App passwords** click **Create app password**

![](https://user-images.githubusercontent.com/721500/54835632-ead3cd80-4c98-11e9-94fb-f94945581fe7.png)

4. Under the **Details** section in **Add app password** enter a label for your password

5. Under **Permissions** select `read` and `write` in the **Repositories** section to ensure that GitHub Desktop has the correct read/write access to your GitLab repositories.

6. Click **Create** to create a new token, and then copy the token to your clipboard.

![](https://user-images.githubusercontent.com/721500/54835624-e8717380-4c98-11e9-89b8-37d286cf99b6.png)

## Cloning your Bitbucket repository in GitHub Desktop

 1. Open GitHub Desktop and go to **File** > **Clone Repository** > **URL**. Enter the Git URL of your Bitbucket repository. Make sure you enter the correct URL, which should have the following structure:

      `https://bitbucket.com/<username>/<repository>`

 2. You will receive an `Authentication Failed` error. Enter your Bitbucket username and paste in the token you just copied to your clipboard as your password. Click **Save and Retry** to successfully clone the repository to your local machine in GitHub Desktop.

![](https://user-images.githubusercontent.com/721500/54835296-33d75200-4c98-11e9-9c6f-71bbfdd26336.png)

   - **Note:** Your Bitbucket credentials will be securely stored on your local machine so you will not need to repeat this process when cloning another repository from Bitbucket.
