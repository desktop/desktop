# Authenticating to Azure DevOps with GitHub Desktop

## Creating a Personal Access Token in Azure DevOps

To authenticate against Azure DevOps repositories you will need to create a personal access token.

- Go to your Azure DevOps account and select **Security** in the user profile dropdown:

![](https://user-images.githubusercontent.com/4404199/29400833-79755fe0-8337-11e7-8cfb-1d346a6801b4.png)

- Select **Personal access tokens** 

- Click **New token** to create a new personal access token. Give it a name, select the organizations you would like the token to apply to, and choose when you would like the token to expire.

    - **Note:** For the **Expiration** dropdown you can select **Custom defined** to select an expiration date up to a year in advance of the         current date. This is useful if you do not want to have to periodically go back and generate a new token after your current token         expires.

 - Under the **Scopes** section choose **Custom defined** and then select **Read & Write** under the **Code** section. This will grant GitHub Desktop read and write access to your Azure DevOps repositories.

- Click **Create** to create a new token, and then copy it to your clipboard.

## Cloning your Azure DevOps repository in GitHub Desktop

 - Open GitHub Desktop and go to **File** > **Clone Repository** > **URL**. Enter the Git URL of your Azure DevOps repository. Make sure you enter the correct URL, which should have the following structure:
 
      `https://<username>@dev.azure.com/<username>/<project_name>/_git/<repository_name>`
 
 - You will receive an `Authentication Failed` error. Enter your Azure DevOps username and paste in the token you just copied to your clipboard. Click **Save and Retry** to successfully clone the repository to your local machine in GitHub Desktop.
 
![](https://user-images.githubusercontent.com/4404199/29401109-8bf03536-8338-11e7-8abb-b467378b6115.png)

 - **Note:** Your Azure DevOps credentials will be securely stored on your local machine so you will not need to repeat this process when cloning another repository from Azure DevOps.

