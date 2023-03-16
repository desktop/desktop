# Profiling Desktop using the Chrome Developer Tools

Sometimes performance issues are hard to identify and recreate. If you notice
a regression and can reproduce it, you can use the Timeline tools in Chrome Dev
Tools to take a snapshot of the application performance and attach it to an
issue.

## Steps

 - Launch Desktop and select **View** | **Toggle Developer Tools**.
  
 <img width="558" src="https://user-images.githubusercontent.com/359239/26888284-f80ed244-4b80-11e7-86cf-933c59b8f370.png">

 - Get the Desktop application ready to perform the problem action.
 - Select the **Performance** tab. Ensure the **Disable JavaScript samples** option is **unchecked**.

<img width="972" src="https://user-images.githubusercontent.com/359239/46921615-e9a8c100-cfd3-11e8-9a0f-eac7fda611f6.png">

 - Press the **Record** button on the left to start recording.

<img width="1051" src="https://user-images.githubusercontent.com/359239/46921640-3be9e200-cfd4-11e8-937b-b3ebbebaab68.png">

 - Perform the problem action in Desktop. Try and keep the test focused on the
   issue you're seeing.
 - Switch back to the Developer tools and press **Stop** to complete recording.

<img width="1050" src="https://user-images.githubusercontent.com/359239/46921658-8a977c00-cfd4-11e8-86ed-d4b6878f08c5.png">

 - In the header, click the **Save profile...** menu item. Save the JSON file
   somewhere you can access later.

<img width="405" src="https://user-images.githubusercontent.com/359239/46921672-b450a300-cfd4-11e8-98c6-cba2b3eef1b8.png">

 - Compress the JSON file to reduce the file size (it could be 10MB or more
   depending on how long you ran the test for).

 - Attach the file to your GitHub issue so the contributors can load this into
   their environment and spelunk the diagnostic information.
