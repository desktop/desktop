# Setting Up Development Dependencies on Windows

 - [Node.js v8.12.0](https://nodejs.org/dist/v8.12.0/)
    - *Make sure you allow the Node.js installer to add node to the PATH.*
 - [Python 2.7](https://www.python.org/downloads/windows/)
    - *Let Python install into the default suggested path (`c:\Python27`), otherwise you'll have
      to configure node-gyp manually with the path which is annoying.*
    - *Ensure the **Add python.exe to Path** option is selected.*
 - One of Visual Studio 2015, Visual C++ Build Tools or Visual Studio 2017
   - [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
     - *Run `npm config set msvs_version 2015` to tell node to use this toolchain.*
   - Visual Studio 2015
     - *Ensure you select the **Common Tools for Visual C++ 2015** feature as that is required by Node.js
        for installing native modules.*
     - *Run `npm config set msvs_version 2015` to tell node to use this toolchain.*
   - [Visual Studio 2017](https://www.visualstudio.com/vs/community/)
     - *Ensure you select the **Desktop development with C++** feature as that is required by Node.js for
        installing native modules.*
     - *Run `npm config set msvs_version 2017` to tell node to use this toolchain.*
