#include <errno.h>
#include <sys/types.h>
#include <signal.h>
#include <unistd.h>
#include "wasi_compat.h"

int sigemptyset(sigset_t *set) {
    if (set) *(unsigned long *)set = 0;
    return 0;
}

int sigfillset(sigset_t *set) {
    if (set) *(unsigned long *)set = ~0UL;
    return 0;
}

int sigaddset(sigset_t *set, int signum) {
    if (set && signum > 0 && signum <= 32) {
        *(unsigned long *)set |= (1UL << (signum - 1));
    }
    return 0;
}

int sigdelset(sigset_t *set, int signum) {
    if (set && signum > 0 && signum <= 32) {
        *(unsigned long *)set &= ~(1UL << (signum - 1));
    }
    return 0;
}

int sigprocmask(int how, const sigset_t *set, sigset_t *oldset) {
    (void)how;
    (void)set;
    (void)oldset;
    return 0;
}

int sigsuspend(const sigset_t *mask) {
    (void)mask;
    errno = EINTR;
    return -1;
}

int kill(pid_t pid, int sig) {
    (void)pid;
    (void)sig;
    return 0;
}

int killpg(pid_t pgrp, int sig) {
    (void)pgrp;
    (void)sig;
    return 0;
}

mode_t umask(mode_t mask) {
    (void)mask;
    return 0022;
}

int pipe(int pipefd[2]) {
    (void)pipefd;
    errno = ENOSYS;
    return -1;
}

pid_t fork(void) {
    errno = ENOSYS;
    return -1;
}

pid_t vfork(void) {
    errno = ENOSYS;
    return -1;
}

int execve(const char *pathname, char *const argv[], char *const envp[]) {
    (void)pathname;
    (void)argv;
    (void)envp;
    errno = ENOSYS;
    return -1;
}

int execvp(const char *file, char *const argv[]) {
    (void)file;
    (void)argv;
    errno = ENOSYS;
    return -1;
}

pid_t wait(int *wstatus) {
    (void)wstatus;
    errno = ECHILD;
    return -1;
}

pid_t waitpid(pid_t pid, int *wstatus, int options) {
    (void)pid;
    (void)wstatus;
    (void)options;
    errno = ECHILD;
    return -1;
}

int dup(int oldfd) {
    (void)oldfd;
    errno = ENOSYS;
    return -1;
}

struct rlimit;
int getrlimit(int resource, struct rlimit *rlim) {
    (void)resource;
    (void)rlim;
    return 0;
}

int setrlimit(int resource, const struct rlimit *rlim) {
    (void)resource;
    (void)rlim;
    return 0;
}

#include <fcntl.h>
#include <string.h>
#include <stdio.h>

int mkstemp(char *template) {
    static int counter = 0;
    char *x = strstr(template, "XXXXXX");
    if (x) {
        snprintf(x, 7, "%06d", ++counter);
    }
    return open(template, O_RDWR | O_CREAT | O_EXCL, 0600);
}

char *getlogin(void) {
    return "student";
}

struct passwd *getpwnam(const char *name) {
    (void)name;
    return NULL;
}

void *dlopen(const char *filename, int flag) {
    (void)filename;
    (void)flag;
    return NULL;
}

void *dlsym(void *handle, const char *symbol) {
    (void)handle;
    (void)symbol;
    return NULL;
}

char *dlerror(void) {
    return "Dynamic loading not supported in WASI";
}

int dlclose(void *handle) {
    (void)handle;
    return 0;
}
