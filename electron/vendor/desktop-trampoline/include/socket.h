#ifdef WINDOWS
#include <winsock.h>
#else 
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#endif

// There are some types missing to make everything Just Work™ in all platforms
#ifdef WINDOWS
#define ssize_t long
#else 
#define SOCKET int
#define INVALID_SOCKET -1
#endif

/** Initializes anything required before working with sockets. */
int initializeNetwork(void);

/** Frees resources initialized by `initializeNetwork`. */
void terminateNetwork(void);

/** Creates a TCP socket and returns its handler. */
SOCKET openSocket(void);

/** Closes an open socket. */
void closeSocket(SOCKET socket);

/** Connects to a given port using a socket. */
int connectSocket(SOCKET socket, unsigned short port);

/** Writes data into a socket. */
int writeSocket(SOCKET socket, const void *buffer, size_t length);

/** Reads data from a socket. */
int readSocket(SOCKET socket, void *buffer, size_t length);

/** Prints socket-related errors to stderr. */
void printSocketError(char *fmt, ...);
