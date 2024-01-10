# Authenticating to Bitbucket with GitHub Desktop

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
