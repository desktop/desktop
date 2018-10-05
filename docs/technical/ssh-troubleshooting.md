# SSH Troubleshooting

This document outlines how Desktop inspects the SSH setup to address a number
of common issues.

## Host Key Verification

As part of initializing the SSH connection, `ssh` will check that it knows
and trusts the server it is connnecting to. When connecting to an unknown
host, `ssh` will prompt to ask if you wish to trust this server:

```shellsession
$ git fetch --progress --prune origin
The authenticity of host 'github.com (192.30.255.112)' can't be established.
RSA key fingerprint is SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8.
Are you sure you want to continue connecting (yes/no)?
```

Desktop currently doesn't have a way to support interactive processes like
this, so we need to hook into some configuration options and manually add this
to the known hosts file that SSH uses.

To avoid the interactive prompt, adding `StrictHostKeyChecking=yes` as an
option to `ssh` ensures that the Git operation will fail rather than hang
waiting for user input:

```shellsession
$ ssh -o StrictHostKeyChecking=yes git@github.com
```

To trust a new server, you can use `ssh-keygen`:

```shellsession
$ ssh-keygen github.com >> ~/.ssh/known_hosts
```

This isn't currently available in `dugite`, but we can leverage either the
OpenSSH environment that comes with Windows 10 Fall Creators Update (should
be on `PATH`) or the version that comes with Git for Windows (need to add to
`PATH`). macOS should have a working SSH setup by default, Linux will likely be
in trouble if it's not on `PATH`.

## The `ssh-agent` process

The `ssh-agent` process is important to the SSH connection process, and needs
to be running for the current user to handle SSH authentication on the local
machine.

If no running `ssh-agent` process is found, Desktop could launch it's own
instance of the process and ensure it is killed when Desktop exits. *This is
currently out of scope for the proof-of-concept.*

As part of launching the `ssh-agent` process, it has a number of environment
variables that help other tools integrate with it:

```shellsession
$ ssh-agent -s
SSH_AUTH_SOCK=/var/folders/dc/ww83254d73g8z6lc9y_msm9r0000gn/T//ssh-oerrG9QXPkWr/agent.15063; export SSH_AUTH_SOCK;
SSH_AGENT_PID=15064; export SSH_AGENT_PID;
echo Agent pid 15064;
```

Desktop needs to inspect these and pass them through to Git whenever it needs
to do anything authentication-related.

## Working with SSH keys

After verifying the SSH server, and confirming a valid `ssh-agent` process is running,
a valid public/private key pair is required that represents the identity of the user.

We can see the existing keys by running `ssh-add l`:

```
$ ssh-all -l
4096 SHA256:V+fJ7HbKo3UindVz0x2XlZcZDr5GAd3p4+Ex7NnCCBI /Users/shiftkey/.ssh/id_rsa_new (RSA)
```

I'm not aware of any CLI tools for identifying available SSH keys, but we can assume
with a good degree of confidence that we have pairs of files at `~/.ssh`:

```
$ ls ~/.ssh/
id_rsa         id_rsa.pub     id_rsa_new     id_rsa_new.pub known_hosts
```

Desktop could list these in the application so that a user may add them to the `ssh-agent`
process.

We can glean some identity information from the public key file - an email address that
was used when it was created - and the name of the file. This should be enough to help
the user identify the right key to add.

We can tell if a private key requires a passphrase by the header contents. Here's a key
that doesn't require a passphrase:

```
-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEA3qKD/4PAc6PMb1yCckTduFl5fA1OpURLR5Z+T4xY1JQt3eTM
```

And this is the header of a key that requires a passphrase:

```
-----BEGIN RSA PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: DES-EDE3-CBC,556C1115CDA822F5

AHi/3++6PEIBv4kfpM57McyoSAAaT2ECxNOA5DRKxJQ9pr2D3aUeMBaBfWGrxd/Q
```

## Creating a new public/private key pair

If no suitable keys are found, the user should be able to create a new SSH key. This
can be done from the command line:

```
ssh-keygen -q -b 4096 -t rsa -N new_passphrase -f output_keyfile
```

Desktop should use a naming convention to make it clear that it was the source of the key,
to ensure it doesn't interfere with existing keys from other sources. Something
like `~/.ssh/github_desktop_[login]` would be radical.
