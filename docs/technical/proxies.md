# Automatic Git Proxy Support

This documented is intended to contain a high level architectural overview of the automatic Git proxy support we're intending to ship in GitHub Desktop 2.4. Since the primary author of the feature (me) will be out on parental leave when 2.4 is slated to be released I'm gonna try to dump as much information as I have in this document. Hopefully it will never need to be referred to but hey, better safe than sorry!

Some of the contents in this document is duplicated from the following pull requests which implemented the feature.

- [#9127 - Parse Proxy Auto-Configuration strings](https://github.com/desktop/desktop/pull/9127)
- [#9139 - Determine remote endpoint for Git network operations](https://github.com/desktop/desktop/pull/9139)

- [#9154 - Automatically set Git proxy environment variables from system configuration](https://github.com/desktop/desktop/pull/9154)
- [#9188 - Support disabling certificate revocation checks on Windows](https://github.com/desktop/desktop/pull/9188)

## High level overview

When talking about network requests in GitHub Desktop it's important to remember that there's essentially two network frameworks at play (technically three if we include Squirrel.*). When GitHub Desktop is talking to the GitHub API as it does for sign-in, retrieving cloneable repositories, issues, etc it's using the Chromium network stack. When performing Git operations such as `pull`, `push`, `fetch`, `ls-remote` Git itself is [relying](https://github.com/git/git/blob/master/http.c) on [libcurl](https://github.com/curl/curl), a widely used cross-platform http library.

In the straightforward case where a user is connected straight to the Internet without any intermediary [proxy servers](https://en.wikipedia.org/wiki/Proxy_server) the distinction above is almost unnoticeable. For the case that concerns us in this document however this difference matters greatly.

### How do users configure 

### Chromium's vs libcurl proxy support

Electron/Chromium automatically sends network requests to the system-configured proxy if one exists. This happens transparently and doesn't require any custom logic from us. libcurl, however, requires manual configuration of proxies. This makes a lot of sense when one considers the complexities involved in resolving a proxy. System configuration dialogs can make proxy configuration seem trivial.

<img width="780" alt="image" src="https://user-images.githubusercontent.com/634063/76533168-f014c400-6477-11ea-99db-d843e9a72dd2.png">

In the example above it's easy to understand that the `192.168.50.36:8888` proxy server will be used for all (http) requests. In most enterprise setups however the proxy address can only be determined when the request URL is known due to the use of [Automatic Proxy Discovery](https://developer.mozilla.org/en-US/docs/Web/HTTP/Proxy_servers_and_tunneling/Proxy_Auto-Configuration_(PAC)_file). Extremely simplified automatic proxy discovery can be described as a javascript function which system administrators compose and which the operating system executes for each request. So while there's been multiple projects started to add automatic proxy detection to cURL it's understandable that the maintainers don't want to take on all the dependencies needed to properly support it.

The cURL documentation contains [a fantastic page about proxies](https://ec.haxx.se/usingcurl/usingcurl-proxies) for anyone who's interested in understanding the nuance involved.

### Git proxy configuration

Now that we've ironed out the differences let's talk about how we can tell Git to use a proxy. Git will look at the `http.proxy` [configuration variable](https://git-scm.com/docs/git-config#Documentation/git-config.txt-httpproxy) as well as the `http_proxy`, `https_proxy`, and `all_proxy` environment variables. The `http.proxy` Git configuration takes precedence over the environment variables. GitHub Desktop will set the `http_proxy` or `https_proxy` **environment variables** and not the configuration variable. 

We could use the configuration variable by using the `git -c http.proxy=foo` approach but that would override any `http.proxy` setting the user might have configured in their global (and/or repo level) git config. More importantly though the `-c` approach wouldn't be inherited by subcommands executed by Git such as Git LFS.

Further more by relying on the environment variables we're able to avoid calling `git config` to read the value of the `http.proxy` variable [like we do for `http.protocol`](https://github.com/desktop/desktop/blob/65f17f1e0482b95a4dfe2b1f9a9f9643a0103aa8/app/src/lib/git/core.ts#L418-L431).

### Bringing it all together

Now that we understand the components involved we can talk about the big picture. When GitHub Desktop is about to perform a Git network operation such as `push`, `pull`, `fetch`, etc we follow this rough flow.

1. [Determine remote endpoint for the Git network operations](https://github.com/desktop/desktop/pull/9139)
2. [Determine if the user has set any environment variables](https://github.com/desktop/desktop/blob/65f17f1e0482b95a4dfe2b1f9a9f9643a0103aa8/app/src/lib/git/environment.ts#L94-L128) such as `http_proxy`, `all_proxy` etc that we would override if we attempted to automatically configure the proxy. If such a variable is set we bail.
3. [Ask Electron to resolve the proxy](https://github.com/desktop/desktop/blob/65f17f1e0482b95a4dfe2b1f9a9f9643a0103aa8/app/src/lib/resolve-git-proxy.ts#L12-L23)
4. [Parse the PAC-string](https://github.com/desktop/desktop/blob/65f17f1e0482b95a4dfe2b1f9a9f9643a0103aa8/app/src/lib/parse-pac-string.ts#L60-L90) that we get back from electron
5. [Set the appropriate proxy environment variables](https://github.com/desktop/desktop/blob/65f17f1e0482b95a4dfe2b1f9a9f9643a0103aa8/app/src/lib/git/environment.ts#L130-L135) 

#### Determining the remote endpoint

In order to resolve the proxy to use for Git network operations we're going to have to have an understanding of what the remote endpoint is gonna be for any given network operation.

Corporate proxies are often set up so that a script determines which proxy to use based on the url that the client wants to access (for https urls the script usually only gets the protocol and domain). See [#9127](https://github.com/desktop/desktop/pull/9127) for details on that.

Unfortunately for us there's not a 1:1 correlation between git command and url. Take the simplest case of `git clone URL` for example. While the initial request will be to `URL` it's possible that the repository could contain submodules pointing to other hosts. It's also possible that the repository is set up to use LFS in which case there may be subsequent requests to a dedicated LFS server.

While there might be multiple endpoints accessed by a single Git call we only have the ability to provide Git one proxy url per protocol (http/https) so we're gonna have do do a best-effort guess at a reasonable host. We're also gonna assume that the vast majority of repositories these days do all of their communications over http**s**.

It's also worth noting that the model we've used to provide Git with authentication details (username/password) has been based on the premise that the same credentials will work for any submodule and/or LFS instance accessed during the operation.

## Windows caveats for MITM proxies

Some Enterprises and organizations use "regular" proxies which only forwards traffic but doesn't actively inspect it. Some, however, use what's commonly referred to as man-in-the-middle proxies, snooping proxies, or https intercepting proxies.

These proxies issue fake ssl certificates when clients make request to https sites and rely on the clients trusting their "fake" certificate authority certificate. See [MITM-proxies](https://ec.haxx.se/usingcurl/usingcurl-proxies#mitm-proxies) in the cURL documentation for a better explanation.

When these snooping proxy servers issue their fake certificate they rarely include any certificate revocation list details. In other words they're not telling the clients who they should contact to see if a particular certificate has been revoked. This is called Certificate Revocation List Distribution Points or CRL DP. The lack of distribution points in a certificate is normally ignored by http(s) clients and that's the case for Git on macOS and linux. On Windows however there's two SSL backends to choose from; `openssl` and `schannel`. OpenSSL is a cross-platform SSL/TLS implementation whereas `schannel` uses the built-in SSL/TLS subsystem in Windows.

Unfortunately the `schannel` backend in cURL throws an error when failing to check for certificate revocation. We've seen this error [so many times](https://github.com/desktop/desktop/issues/3326) that it's made our "known issues" document. To combat this a new configuration option (`http.schannelCheckRevoke`) was added to Git which lets users disable certificate revocation checks entirely. This certainly isn't ideal and we'd like to see a solution to allow best effort certificate revocation checks which always attempts to check for revocation but doesn't throw an error if it fails to do so (see the Future improvements section below).

For now though this is our only workaround and as such [#9188](https://github.com/desktop/desktop/pull/9188) was introduced which detects this specific error and allow the user to disable revocation checks. **Note: the toggle to turn this setting on or off in the options dialog is hidden unless this condition has been encountered before**

## Risks/concerns/tradeoffs

### There's no way to disable the automatic proxy support from the UI

When implementing this feature we debated whether to include an "opt-out" setting in preferences to turn off the automatic proxy support. We decided against it for a few reasons. One being that we really wanted this feature to be exactly as transparent as the proxy support in Electron is today. We also felt that since we never override existing Git proxy configuration variables there's very little risk to existing users who are successfully using GitHub Desktop with a proxy today.

### Can resolveProxy be slow?

While I haven't found any indication of this being an actual problem it's theoretically possible that the resolveProxy logic in Electron/Chromium could be slow and therefore add an unreasonable delay to each Git network operation. Should this problem exist my assumption is that it's very rare as it would presumably have manifested itself in super slow API requests for the same reason. Nevertheless, should this occur post launch my recommendation for mitigation would be to either add an explicit timeout (using Promise.race) or add some way of disabling the entire proxy support from the UI (preferences). A workaround for users experiencing such a problem would be to set the `all_proxy` environment variable to the same value that they currently have for their `http.proxy` Git config variable as that effectively kills the automatic proxy support in GitHub Desktop.

## Potentially confusing things

### https proxies?

When reading about proxies and when reading our own implementation one thing to keep in mind is the confusing difference between an https proxy and the `https_proxy` environment variable. An https proxy is a proxy server which the client talks to over the https protocol whereas the `https_proxy` environment variable determines what proxy to use when the client wants to connect to an https server. To illustrate the difference here's a few example

- https_proxy='http://proxy.local'
  - Very common setup, tells Git to use the http proxy at proxy.local when connecting to an https server (like https://github.com)
- https_proxy='socks4://proxy.local'
  - Fairly rare setup. Tells Git to use the SOCKS4 proxy at proxy.local when connecting to an https server (like https://github.com)
- http_proxy=https://proxy.local`
  - Really rare setup. Tells Git to use the https proxy at proxy.local when connecting to a non-encrypted http server

It's further worth noting that https proxy support is so uncommon that it's not even supported in the version of Git/libcurl we use on Windows

```
C:\Users\markus\AppData\Local\GitHubDesktop\app-2.3.1\resources\app\git\cmd>git -c http.proxy=https://localhost:8888 ls-remote https://github.com/niik/RxSpy
fatal: unable to access 'https://github.com/niik/RxSpy/': Unsupported proxy 'localhost:8888', libcurl is built without the HTTPS-proxy support.
```

## Debugging tips

In order to inspect what Electron sends back as the proxy server for a given request I've been using this command in the console.

```javascript
require('electron').remote.session.defaultSession.resolveProxy('https://github.com').then(console.log)
```

When debugging user issues with this feature I also imagine it would be useful to inspect their environment variables using

```javascript
Object.keys(process.env).filter(k => /proxy/i.test(k))
```

Further more I'd expect a copy of the user's `~/.gitconfig` file to yield interesting results when troubleshooting knowing that the mere presence of an `http.proxy` config variable **even if it's empty** will override our support. For example:

```
> https_proxy=http://proxy.local:8888 git -c http.proxy= ls-remote https://github.com/desktop/desktop
```

That network request will **not** use a proxy server. So if you're troubleshooting a case where a user expects GitHub Desktop to automatically resolve the proxy server but doesn't you should look to see if they've got a blank `http.proxy` configuration variable set and perhaps suggest they remove that using something like `git config --global --unset http.proxy` (if it's configured globally) 

## Future improvements

#### Authenticating proxies

A stretch goal for the proxy support was supporting authenticating proxies. That unfortunately didn't make it in. Worth noting here is that not even Electron supports authenticating proxies out of the box so there's no users out there today that's using GitHub Desktop in signed-in mode with an authenticating proxy blocking their traffic.

#### Best effort certificate revocation checks in cURL

In cooperation with (and largely thanks to) @dscho we're working with the cURL team to [add best-effort revocation checking to the schannel backend](https://github.com/curl/curl/pull/4981). That, combined with the new changes to the [http.schannelCheckRevoke](https://github.com/git-for-windows/git/pull/2535) configuration variable in Git will eventually let us achieve a completely transparent proxy experience for users behind MITM proxies on Windows.
