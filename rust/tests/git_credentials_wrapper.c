/* Native-only test instrumentation: no production Git or credential handling.
 * Build with an operation-private git_credentials_wrapper_config.h defining
 * FIXTURE_REAL_GIT, FIXTURE_ALICE, FIXTURE_BOB and FIXTURE_ENV as C strings.
 * The compiler command line must contain only source/include/output paths.
 * Credential stdin is never inspected. execv preserves argv, streams, status
 * and signal behavior; credential routing/cwd diagnostics are intentionally absent.
 */
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include "git_credentials_wrapper_config.h"

#define CONTROL_LIMIT 65536
#define STRING_LIMIT 128
#define JSON_DEPTH 32
extern char **environ;

struct parser { const unsigned char *at, *end; unsigned depth; };
struct gate { char value[STRING_LIMIT]; size_t length; bool present; };

static int failure(void) {
    static const char message[] = "Git credential fixture instrumentation failed\n";
    (void)write(STDERR_FILENO, message, sizeof(message) - 1);
    return 125;
}

static bool write_all(int fd, const char *data, size_t length) {
    while (length) {
        ssize_t count = write(fd, data, length);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return false;
        data += count; length -= (size_t)count;
    }
    return true;
}

static bool has_secret(const char *text) {
    const char *secrets[] = { FIXTURE_ALICE, FIXTURE_BOB, FIXTURE_ENV };
    for (size_t i = 0; i < sizeof(secrets) / sizeof(secrets[0]); i++)
        if (*secrets[i] && strstr(text, secrets[i])) return true;
    return false;
}

static const char *command_argument(int argc, char **argv) {
    for (int i = 1; i < argc; i++) {
        const char *arg = argv[i];
        if (!strcmp(arg, "-C") || !strcmp(arg, "-c") || !strcmp(arg, "--git-dir") ||
            !strcmp(arg, "--work-tree") || !strcmp(arg, "--namespace")) {
            if (i + 1 < argc) i++;
        } else if (*arg != '-') return arg;
    }
    return NULL;
}

/* Only constant vocabulary reaches JSON. A malformed command or an alias is
 * recorded as "other", so an argv value can never become a diagnostic leak. */
static const char *logged_command(const char *command) {
    static const char *const commands[] = {
        "add", "apply", "archive", "bisect", "blame", "branch", "bundle",
        "cat-file", "checkout", "checkout-index", "cherry-pick", "clean",
        "clone", "commit", "config", "count-objects", "credential", "describe",
        "diff", "diff-files", "diff-index", "diff-tree", "fetch", "for-each-ref",
        "fsck", "gc", "hash-object", "help", "init", "lfs", "log", "ls-files",
        "ls-remote", "ls-tree", "merge", "merge-base", "merge-file", "mktag",
        "mktree", "mv", "notes", "pack-objects", "prune", "pull", "push",
        "read-tree", "rebase", "reflog", "remote", "reset", "restore", "rev-list",
        "rev-parse", "revert", "rm", "show", "show-ref", "sparse-checkout",
        "stash", "status", "stripspace", "submodule", "symbolic-ref", "tag",
        "update-index", "update-ref", "var", "version", "worktree", "write-tree"
    };
    if (!command) return NULL;
    if (!has_secret(command))
        for (size_t i = 0; i < sizeof(commands) / sizeof(commands[0]); i++)
            if (!strcmp(command, commands[i])) return commands[i];
    return "other";
}

static bool log_call(const char *command, int argc, char **argv) {
    const char *path = getenv("CREDENTIALS_GIT_LOG");
    if (!path || !*path) return false;
    bool argv_clean = true, environment_clean = true;
    for (int i = 1; i < argc; i++) if (has_secret(argv[i])) argv_clean = false;
    for (char **entry = environ; *entry; entry++) {
        const char *value = strchr(*entry, '=');
        if (value && !strcmp(value + 1, FIXTURE_ALICE)) environment_clean = false;
    }
    char row[256];
    int length = snprintf(row, sizeof(row),
        "{\"command\":%s%s%s,\"argv_clean\":%s,\"alice_environment_clean\":%s}\n",
        command ? "\"" : "", command ? command : "null", command ? "\"" : "",
        argv_clean ? "true" : "false", environment_clean ? "true" : "false");
    if (length < 0 || (size_t)length >= sizeof(row)) return false;
    int fd = open(path, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0600);
    if (fd < 0) return false;
    struct flock lock = { .l_type = F_WRLCK, .l_whence = SEEK_SET };
    int status;
    do { status = fcntl(fd, F_SETLKW, &lock); } while (status < 0 && errno == EINTR);
    bool ok = status == 0 && write_all(fd, row, (size_t)length);
    if (close(fd) < 0) ok = false;
    return ok;
}

static void whitespace(struct parser *p) {
    while (p->at < p->end && (*p->at == ' ' || *p->at == '\t' ||
           *p->at == '\r' || *p->at == '\n')) p->at++;
}

static int hex(unsigned char byte) {
    if (byte >= '0' && byte <= '9') return byte - '0';
    if (byte >= 'a' && byte <= 'f') return byte - 'a' + 10;
    if (byte >= 'A' && byte <= 'F') return byte - 'A' + 10;
    return -1;
}

static bool codepoint(struct parser *p, unsigned *value) {
    if ((size_t)(p->end - p->at) < 4) return false;
    *value = 0;
    for (unsigned i = 0; i < 4; i++) {
        int digit = hex(*p->at++);
        if (digit < 0) return false;
        *value = *value * 16 + (unsigned)digit;
    }
    return true;
}

static void string_byte(char *out, size_t capacity, size_t *length, unsigned char byte) {
    if (out && *length + 1 < capacity) out[*length] = (char)byte;
    (*length)++;
}

static bool string(struct parser *p, char *out, size_t capacity, size_t *length) {
    whitespace(p); *length = 0;
    if (p->at == p->end || *p->at++ != '"') return false;
    while (p->at < p->end) {
        unsigned char byte = *p->at++;
        if (byte == '"') {
            if (out && capacity) out[*length < capacity ? *length : capacity - 1] = '\0';
            return true;
        }
        if (byte < 0x20) return false;
        if (byte != '\\') { string_byte(out, capacity, length, byte); continue; }
        if (p->at == p->end) return false;
        byte = *p->at++;
        if (byte == 'u') {
            unsigned value;
            if (!codepoint(p, &value)) return false;
            if (value >= 0xd800 && value <= 0xdbff) {
                if ((size_t)(p->end - p->at) < 6 || p->at[0] != '\\' || p->at[1] != 'u') return false;
                p->at += 2; unsigned low;
                if (!codepoint(p, &low) || low < 0xdc00 || low > 0xdfff) return false;
                value = 0x10000 + ((value - 0xd800) << 10) + low - 0xdc00;
            } else if (value >= 0xdc00 && value <= 0xdfff) return false;
            if (value <= 0x7f) string_byte(out, capacity, length, (unsigned char)value);
            else if (value <= 0x7ff) {
                string_byte(out, capacity, length, (unsigned char)(0xc0 | (value >> 6)));
                string_byte(out, capacity, length, (unsigned char)(0x80 | (value & 0x3f)));
            } else if (value <= 0xffff) {
                string_byte(out, capacity, length, (unsigned char)(0xe0 | (value >> 12)));
                string_byte(out, capacity, length, (unsigned char)(0x80 | ((value >> 6) & 0x3f)));
                string_byte(out, capacity, length, (unsigned char)(0x80 | (value & 0x3f)));
            } else {
                string_byte(out, capacity, length, (unsigned char)(0xf0 | (value >> 18)));
                string_byte(out, capacity, length, (unsigned char)(0x80 | ((value >> 12) & 0x3f)));
                string_byte(out, capacity, length, (unsigned char)(0x80 | ((value >> 6) & 0x3f)));
                string_byte(out, capacity, length, (unsigned char)(0x80 | (value & 0x3f)));
            }
            continue;
        }
        switch (byte) {
            case '"': case '\\': case '/': break;
            case 'b': byte = '\b'; break; case 'f': byte = '\f'; break;
            case 'n': byte = '\n'; break; case 'r': byte = '\r'; break;
            case 't': byte = '\t'; break; default: return false;
        }
        string_byte(out, capacity, length, byte);
    }
    return false;
}

static bool value(struct parser *p) {
    whitespace(p);
    if (p->at == p->end) return false;
    if (*p->at == '"') { size_t length; return string(p, NULL, 0, &length); }
    if (*p->at == '{' || *p->at == '[') {
        bool object = *p->at++ == '{'; unsigned char end = object ? '}' : ']';
        if (++p->depth > JSON_DEPTH) return false;
        whitespace(p);
        if (p->at < p->end && *p->at == end) { p->at++; p->depth--; return true; }
        while (p->at < p->end) {
            if (object) {
                size_t length;
                if (!string(p, NULL, 0, &length)) return false;
                whitespace(p); if (p->at == p->end || *p->at++ != ':') return false;
            }
            if (!value(p)) return false;
            whitespace(p); if (p->at == p->end) return false;
            if (*p->at == end) { p->at++; p->depth--; return true; }
            if (*p->at++ != ',') return false;
        }
        return false;
    }
    const char *literals[] = { "true", "false", "null" };
    for (size_t i = 0; i < sizeof(literals) / sizeof(literals[0]); i++) {
        size_t length = strlen(literals[i]);
        if ((size_t)(p->end - p->at) >= length && !memcmp(p->at, literals[i], length)) {
            p->at += length; return true;
        }
    }
    if (*p->at == '-') p->at++;
    if (p->at == p->end) return false;
    if (*p->at == '0') p->at++;
    else if (*p->at >= '1' && *p->at <= '9')
        do { p->at++; } while (p->at < p->end && *p->at >= '0' && *p->at <= '9');
    else return false;
    if (p->at < p->end && *p->at == '.') {
        p->at++; const unsigned char *start = p->at;
        while (p->at < p->end && *p->at >= '0' && *p->at <= '9') p->at++;
        if (p->at == start) return false;
    }
    if (p->at < p->end && (*p->at == 'e' || *p->at == 'E')) {
        p->at++; if (p->at < p->end && (*p->at == '+' || *p->at == '-')) p->at++;
        const unsigned char *start = p->at;
        while (p->at < p->end && *p->at >= '0' && *p->at <= '9') p->at++;
        if (p->at == start) return false;
    }
    return true;
}

static bool control_gate(struct gate *gate) {
    const char *path = getenv("CREDENTIALS_CONTROL");
    if (!path || !*path) return false;
    int fd = open(path, O_RDONLY | O_CLOEXEC);
    if (fd < 0) return false;
    struct stat metadata;
    if (fstat(fd, &metadata) < 0 || !S_ISREG(metadata.st_mode)) { close(fd); return false; }
    unsigned char bytes[CONTROL_LIMIT + 1]; size_t length = 0;
    while (length < sizeof(bytes)) {
        ssize_t count = read(fd, bytes + length, sizeof(bytes) - length);
        if (count < 0 && errno == EINTR) continue;
        if (count < 0) { close(fd); return false; }
        if (!count) break;
        length += (size_t)count;
    }
    if (close(fd) < 0 || length > CONTROL_LIMIT) return false;
    struct parser p = { bytes, bytes + length, 0 };
    gate->present = false; whitespace(&p);
    if (p.at == p.end || *p.at++ != '{') return false;
    bool closed = false; whitespace(&p);
    if (p.at < p.end && *p.at == '}') { p.at++; closed = true; }
    else while (p.at < p.end) {
        char key[16]; size_t key_length;
        if (!string(&p, key, sizeof(key), &key_length)) return false;
        whitespace(&p); if (p.at == p.end || *p.at++ != ':') return false;
        whitespace(&p);
        bool wanted = key_length == 4 && !memcmp(key, "gate", 4);
        if (wanted) {
            gate->present = false;
            if (p.at < p.end && *p.at == '"') {
                if (!string(&p, gate->value, sizeof(gate->value), &gate->length)) return false;
                gate->present = gate->length > 0 && gate->length < sizeof(gate->value);
            } else if (!value(&p)) return false;
        } else if (!value(&p)) return false;
        whitespace(&p); if (p.at == p.end) return false;
        if (*p.at == '}') { p.at++; closed = true; break; }
        if (*p.at++ != ',') return false;
    }
    whitespace(&p); return closed && p.at == p.end;
}

static bool wait_for_gate(const struct gate *gate, const char *command) {
    const char *inherited = getenv("CREDENTIALS_GATE_CHILD");
    if (!gate->present || !command || (inherited && *inherited) ||
        strlen(command) != gate->length || memcmp(command, gate->value, gate->length)) return true;
    const char *started = getenv("CREDENTIALS_GATE_STARTED");
    const char *release = getenv("CREDENTIALS_GATE_RELEASE");
    if (!started || !*started || !release || !*release) return false;
    int fd = open(started, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
    if (fd < 0) return false;
    bool ok = write_all(fd, "started", 7);
    if (close(fd) < 0 || !ok) return false;
    struct timespec start, now;
    if (clock_gettime(CLOCK_MONOTONIC, &start) < 0) return false;
    while (access(release, F_OK) != 0) {
        if (clock_gettime(CLOCK_MONOTONIC, &now) < 0) return false;
        time_t seconds = now.tv_sec - start.tv_sec;
        if (seconds > 25 || (seconds == 25 && now.tv_nsec >= start.tv_nsec)) break;
        struct timespec delay = { 0, 20000000 };
        if (nanosleep(&delay, NULL) < 0 && errno != EINTR) return false;
    }
    return setenv("CREDENTIALS_GATE_CHILD", "1", 1) == 0;
}

int main(int argc, char **argv) {
    signal(SIGINT, SIG_DFL); signal(SIGTERM, SIG_DFL); signal(SIGHUP, SIG_DFL);
    const char *command = command_argument(argc, argv);
    if (!log_call(logged_command(command), argc, argv)) return failure();
    struct gate gate;
    if (!control_gate(&gate) || !wait_for_gate(&gate, command)) return failure();
    argv[0] = (char *)FIXTURE_REAL_GIT;
    execv(FIXTURE_REAL_GIT, argv);
    (void)failure(); return 127;
}
