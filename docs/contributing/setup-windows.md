# Setting Up Development Dependencies on Windows

You will need to install these tools on your machine:

 - Node.js v8.12.0
 - Python 2.7
 - Visual C++ Build Tools

## Node.js

Let's see if you have the right version of `node` installed. Open a shell and
run this command:

```shellsession
$ node -v
```

If you see an error about being unable to find `node`, that probably means you
don't have any Node tools installed. You can install Node 8 from the
[Node.js website](https://nodejs.org/download/release/v8.12.0/) and restart your
shell.

If you see the output `v8.12.0`, you're good to go.

If you see the output `v10.x.y` you're ahead of what we currently support. See
[#5876](https://github.com/desktop/desktop/issues/5876) for details about
building GitHub Desktop with Node 10, which we can hopefully resolve soon. If
you don't care about the version you are running, you can install the version
from the [Node.js website](https://nodejs.org/download/release/v8.12.0/) over
the top of your current install.

**Node.js installation notes:**
 - make sure you allow the Node.js installer to add `node` to the PATH.

### I need to use different versions of Node.js in different projects!

_TODO: what options do we have here for Windows?_

## Python

Open a shell and run this command:

```shellsession
$ python --version
```

If you see the output `Python 2.7`, you're good to go!

If you see an error about being unable to find `python`, that probably means you
don't have any Node tools installed. You can install Python 2.7 from the
[Python website](https://www.python.org/downloads/windows/).

**Python installation notes:**

 - Let Python install into the default suggested path (`c:\Python27`), otherwise
   you'll have to configure `node-gyp` manually to look at a different path.
 - Ensure the **Add python.exe to Path** option is selected.

### I need to use different versions of Python in different projects!

_TODO: what options do we have here for Windows?_

## Visual C++ Build Tools

To build native Node modules, you will need a recent version of Visual C++ which
can be obtained in several ways

### Visual Studio 2017

If you have an existing installation of VS2017, run the **Visual Studio
Installer** and check that you have the **Desktop development with C++**
workload included.

<img width="1265" src="https://user-images.githubusercontent.com/359239/48849855-a2091800-ed7d-11e8-950b-93465eba7cd1.png">

Once you've confirmed that, open a shell and run this command to update the
configuration of NPM::

```shellsession
$ npm config set msvs_version 2017
```

### Visual Studio 2015

If you have an existing installation of VS2015, run the setup program again and
and check that you have the **Common Tools for Visual C++ 2015** feature
enabled.

<img width="475" src="https://user-images.githubusercontent.com/359239/48850346-d92bf900-ed7e-11e8-9728-e5b70654f90f.png">

Once you've confirmed that is present and any updates are applied, open a shell
and run this command to update the configuration of NPM:

```shellsession
$ npm config set msvs_version 2015
```

### Visual C++ Build Tools

If you do not have an existing Visual Studio installation, there is a
standalone [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
installer available.

After installation open a shell and run this command to update the configuration
of NPM:

```shellsession
$ npm config set msvs_version 2015
```
