# Authenticating to Azure DevOps with GitHub Desktop

## Creating a Personal Access Token in Azure DevOps

To authenticate against Azure DevOps repositories you will need to create a personal access token.

1. Go to your Azure DevOps account and select **Personal Access Tokens** in the user settings dropdown:

![](https://user-images.githubusercontent.com/792378/90431645-f9d9cd80-e08e-11ea-9fb4-ca8ba2a5d769.png)

2. Click **New token** to create a new personal access token. Give it a name, select the organizations you would like the token to apply to, and choose when you would like the token to expire.

   - **Note:** For the **Expiration** dropdown you can select **Custom defined** to select an expiration date up to a year in advance of the current date. This is useful if you do not want to have to periodically go back and generate a new token after your current token expires.

3 . Under the **Scopes** section choose **Custom defined** and then select **Read & Write** under the **Code** section. This will grant GitHub Desktop read and write access to your Azure DevOps repositories.

4 . Click **Create** to create a new token, and then copy it to your clipboard.

 ![](https://user-images.githubusercontent.com/721500/51131191-fd470c00-17fc-11e9-8895-94f3784ebd4b.png)

## Cloning your Azure DevOps repository in GitHub Desktop

 1. Open GitHub Desktop and go to **File** > **Clone Repository** > **URL**. Enter the Git URL of your Azure DevOps repository. Make sure you enter the correct URL, which should have the following structure:

      `https://<username>@dev.azure.com/<username>/<project_name>/_git/<repository_name>`

 2. You will receive an `Authentication Failed` error. Enter your Azure DevOps username and paste in the token you just copied to your clipboard. Click **Save and Retry** to successfully clone the repository to your local machine in GitHub Desktop.

![](https://user-images.githubusercontent.com/4404199/29401109-8bf03536-8338-11e7-8abb-b467378b6115.png)

   - **Note:** Your Azure DevOps credentials will be securely stored on your local machine so you will not need to repeat this process when cloning another repository from Azure DevOps.

