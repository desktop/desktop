#include <stdio.h>

int main(int argc, char *argv[], char *envp[]) {
    fprintf(stdout, "--printenvz--begin\n"); // Ensure stdout is initialized
    for (char **env = envp; *env != NULL; ++env) {
        fprintf(stdout, "%s%c", *env, '\0');
    }
    fprintf(stdout, "\n--printenvz--end\n"); // Ensure stdout is initialized
    return 0;
}
