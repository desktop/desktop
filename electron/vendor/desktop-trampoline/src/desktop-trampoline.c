#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "socket.h"

#define BUFFER_LENGTH 4096
#define MAXIMUM_NUMBER_LENGTH 33

#ifdef CREDENTIAL_HELPER
  #define DESKTOP_TRAMPOLINE_IDENTIFIER "CREDENTIALHELPER"
#else
  #define DESKTOP_TRAMPOLINE_IDENTIFIER "ASKPASS"
#endif


#define WRITE_STRING_OR_EXIT(dataName, dataString) \
if (writeSocket(socket, dataString, strlen(dataString) + 1) != 0) { \
  printSocketError("ERROR: Couldn't send " dataName); \
  return 1; \
}

// This is a list of valid environment variables that GitHub Desktop might
// send or expect to receive.
#define NUMBER_OF_VALID_ENV_VARS 1
static const char *sValidEnvVars[NUMBER_OF_VALID_ENV_VARS] = {
  "DESKTOP_TRAMPOLINE_TOKEN",
};

/** Returns 1 if a given env variable is valid, 0 otherwise. */
int isValidEnvVar(char *env) {
  for (int idx = 0; idx < NUMBER_OF_VALID_ENV_VARS; idx++) {
    const char *candidate = sValidEnvVars[idx];

    // Make sure that not only the passed env var string starts with the
    // candidate contesnts, but also that there is a '=' character right after:
    // Valid: "DESKTOP_USERNAME=sergiou87"
    // Not valid: "DESKTOP_USERNAME_SOMETHING=sergiou87"
    if (strncmp(env, candidate, strlen(candidate)) == 0
        && strlen(env) > strlen(candidate)
        && env[strlen(candidate)] == '=') {
      return 1;
    }
  }

  return 0;
}

int runTrampolineClient(SOCKET *outSocket, int argc, char **argv, char **envp) {
  char *desktopPortString;

  desktopPortString = getenv("DESKTOP_PORT");

  if (desktopPortString == NULL) {
    fprintf(stderr, "ERROR: Missing DESKTOP_PORT environment variable\n");
    return 1;
  }

  unsigned short desktopPort = atoi(desktopPortString);

  SOCKET socket = openSocket();

  if (socket == INVALID_SOCKET) {
    printSocketError("ERROR: Couldn't create TCP socket");
    return 1;
  }

  *outSocket = socket;

  if (connectSocket(socket, desktopPort) != 0) {
    printSocketError("ERROR: Couldn't connect to 127.0.0.1:%d - Please make "
                     "sure you don't have an antivirus or firewall blocking "
                     "this connection.", desktopPort);
    return 1;
  }

  // Send the number of arguments (except the program name)
  char argcString[MAXIMUM_NUMBER_LENGTH];
  snprintf(argcString, MAXIMUM_NUMBER_LENGTH, "%d", argc - 1);
  WRITE_STRING_OR_EXIT("number of arguments", argcString);

  // Send each argument separated by \0
  for (int idx = 1; idx < argc; idx++) {
    WRITE_STRING_OR_EXIT("argument", argv[idx]);
  }

  // Get the number of environment variables
  char *validEnvVars[NUMBER_OF_VALID_ENV_VARS + 1];
  validEnvVars[0] = "DESKTOP_TRAMPOLINE_IDENTIFIER=" DESKTOP_TRAMPOLINE_IDENTIFIER;
  int envc = 1;
  for (char **env = envp; *env != 0; env++) {
    if (isValidEnvVar(*env)) {
      validEnvVars[envc] = *env;
      envc++;
    }
  }

  // Send the number of environment variables
  char envcString[MAXIMUM_NUMBER_LENGTH];
  snprintf(envcString, MAXIMUM_NUMBER_LENGTH, "%d", envc);
  WRITE_STRING_OR_EXIT("number of environment variables", envcString);

  // Send the environment variables
  for (int idx = 0; idx < envc; idx++) {
    WRITE_STRING_OR_EXIT("environment variable", validEnvVars[idx]);
  }

  char stdinBuffer[BUFFER_LENGTH + 1];
  int stdinBytes = 0;

  #ifdef CREDENTIAL_HELPER
    stdinBytes = fread(stdinBuffer, sizeof(char), BUFFER_LENGTH, stdin);
  #endif

  stdinBuffer[stdinBytes] = '\0';
  WRITE_STRING_OR_EXIT("stdin", stdinBuffer);

  char buffer[BUFFER_LENGTH + 1];
  size_t totalBytesRead = 0;
  ssize_t bytesRead = 0;

  // Read output from server
  do {
    bytesRead = readSocket(socket, buffer + totalBytesRead, BUFFER_LENGTH - totalBytesRead);

    if (bytesRead == -1) {
      printSocketError("ERROR: Error reading from socket");
      return 1;
    }

    totalBytesRead += bytesRead;
  } while (bytesRead > 0);

  buffer[totalBytesRead] = '\0';

  // Write that output to stdout
  fprintf(stdout, "%s", buffer);

  return 0;
}

int main(int argc, char **argv, char **envp) {
  if (initializeNetwork() != 0) {
    return 1;
  }

  SOCKET socket = INVALID_SOCKET;
  int result = runTrampolineClient(&socket, argc, argv, envp);  

  if (socket != INVALID_SOCKET)
  {
    closeSocket(socket);
  }

  terminateNetwork();

  return result;
}
