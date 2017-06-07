# Profiling Desktop using the Chrome Developer Tools

Sometimes performance issues are hard to identify and recreate. If you notice
a regression and can reproduce it, you can use the Timeline tools in Chrome Dev
Tools to take a snapshot of the application performance and attach it to an
issue.

## Steps

 - Launch Desktop and select **View** | **Toggle Developer Tools**.
  
 <img width="558" src="https://user-images.githubusercontent.com/359239/26888284-f80ed244-4b80-11e7-86cf-933c59b8f370.png">

 - Get the Desktop application ready to perform the problem action.
 - Select the **Timeline** tab.

<img width="1123" src="https://user-images.githubusercontent.com/359239/26887089-7c82f0cc-4b7d-11e7-9cf4-fcbd5a994e1f.png">

 - Ensure you have **JS Profile** checked - other items might be helpful, but
   will add to the size of the generated timeline data.

<img width="1123" src="https://user-images.githubusercontent.com/359239/26888385-3fc9157c-4b81-11e7-9083-379a37d20641.png">

 - Press the **Record** button on the left to start recording.

<img width="1123" src="https://user-images.githubusercontent.com/359239/26887091-7c8acc3e-4b7d-11e7-9d32-961ac353f1b9.png">

 - Perform the problem action in Desktop. Try and keep the test focused on the
   issue you're seeing.
 - Switch back to the Developer tools and press **Stop** to complete recording.

 <img width="1011"  src="https://user-images.githubusercontent.com/359239/26887304-0700a514-4b7e-11e7-9a1d-74fac88cecee.png">

 - In the graph section, right-click and select **Save timeline data**. Save the
   JSON file somewhere you can access later.

 <img width="1014" alt="screen shot 2017-06-07 at 12 38 18 pm" src="https://user-images.githubusercontent.com/359239/26887386-472e9c7c-4b7e-11e7-9d39-a9b71ea3d70a.png">

 - Compress the JSON file to reduce the file size (it could be 10MB or more
   depending on how long you ran the test for).

 - Attach the file to your GitHub issue so the contributors can load this into
   their environment and spelunk the diagnostic information.
