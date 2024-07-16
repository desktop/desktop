# Authenticating to Bitbucket with GitHub Desktop

GitHub Desktop now provides support for [Git Credential Manager (GCM)](https://gh.io/gcm), which makes the task of authenticating to Bitbucket repositories easy and secure. This feature can be enabled by going to **File** > **Options** > **Advanced** on Windows, or **GitHub Desktop** > **Preferences** > **Advanced** on macOS, and then selecting the **Use Git Credential Manager** checkbox.

![screenshot of the GitHub Desktop settings menu with the "Use Git Credential Manager" checkbox outlined](/docs/assets/git-credential-manager.png)

When Git Credential Manager is enabled all credentials for Bitbucket will be handled, and stored, outside of GitHub Desktop. Git Credential Manager supports browser authentication and will avoid the need to create personal access tokens (PATs). 

The prompt to authenticate to your Bitbucket account using GCM will be shown when you go to **File** > **Clone Repository** > **URL** and enter the HTTPS clone URL of the repository.

![screenshot of a prompt showing the option to sign in with your browser to an Atlassian account](/docs/assets/bitbucket-prompt.png)

If you would prefer not to use GCM and need to create a personal access token in Bitbucket you can follow the steps below.

## Creating a Personal Access Token in Bitbucket

To authenticate against Bitbucket repositories you will need to create a personal access token.

1. Go to your Bitbucket account and select **Personal Bitbucket settings** in the settings dropdown.

2. Select **App passwords**

3. Under **App passwords** click **Create app password**

![image](https://user-images.githubusercontent.com/38629827/227267197-6b442b6f-ee37-42a6-9e99-3b83a05b9c72.png)


4. Under the **Details** section in **Add app password** enter a label for your password

5. Under **Permissions** select `Read` and `Write` in the **Repositories** section to ensure that GitHub Desktop has the correct read/write access to your Bitbucket repositories.

6. Click **Create** to create a new token, and then copy the token to your clipboard.

![image](https://user-images.githubusercontent.com/38629827/227267762-91745d4c-21b0-4164-badd-d69b0c99e95b.png)
![image](https://user-images.githubusercontent.com/38629827/227267974-fd5c3146-eca8-4976-84d6-26bafaa38348.png)


## Cloning your Bitbucket repository in GitHub Desktop

 1. Open GitHub Desktop and go to **File** > **Clone Repository** > **URL**. Enter the Git URL of your Bitbucket repository. Make sure you enter the correct URL, which should have the following structure:

      `https://bitbucket.com/<username>/<repository>`

 2. You will receive an `Authentication Failed` error. Enter your Bitbucket username and paste in the token you just copied to your clipboard as your password. Click **Save and Retry** to successfully clone the repository to your local machine in GitHub Desktop.

![](https://user-images.githubusercontent.com/721500/54835296-33d75200-4c98-11e9-9c6f-71bbfdd26336.png)

   - **Note:** Your Bitbucket credentials will be securely stored on your local machine so you will not need to repeat this process when cloning another repository from Bitbucket.
