#ifdef WINDOWS

int main(int argc, char **argv) {
  // Not needed on Windows, this will just create a dummy executable
  return -1;
}

#else

#include <unistd.h>
#include <stdio.h>

/**
 * This is a wrapper for the ssh command. It is used to make sure ssh runs without
 * a tty on macOS, allowing GitHub Desktop to intercept different prompts from
 * ssh (e.g. passphrase, adding a host to the list of known hosts...).
 * This is not necessary on more recent versions of OpenSSH (starting with v8.3)
 * which include support for the SSH_ASKPASS_REQUIRE environment variable.
 */
int main(int argc, char **argv) {
  pid_t child = fork();

  if (child < 0) {
    fprintf(stderr, "Failed to fork\n");
    return -1;
  }

  if (child != 0) {
    // This is the parent process. Just exit.
    return 0;
  }

  setsid();
  return execvp("ssh", argv);
}

#endif
