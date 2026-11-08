#ifndef MAKE_WASI_COMPAT_H
#define MAKE_WASI_COMPAT_H

#ifndef __ASSEMBLER__

#include <sys/types.h>
#include <signal.h>
#include <errno.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Host-assisted recipe and shell command execution imports */
__attribute__((__import_module__("env"), __import_name__("wasi_run_recipe")))
int wasi_run_recipe(const char *cmd_line, const char *const *envp);

__attribute__((__import_module__("env"), __import_name__("wasi_capture_command")))
int wasi_capture_command(const char *cmd_line, char *out_buf, int max_len);

/* POSIX process, signal, and descriptor stubs */
#ifndef SIG_BLOCK
#define SIG_BLOCK 0
#define SIG_UNBLOCK 1
#define SIG_SETMASK 2
#endif

int sigemptyset(sigset_t *set);
int sigfillset(sigset_t *set);
int sigaddset(sigset_t *set, int signum);
int sigdelset(sigset_t *set, int signum);
int sigprocmask(int how, const sigset_t *set, sigset_t *oldset);
int sigsuspend(const sigset_t *mask);

int kill(pid_t pid, int sig);
int killpg(pid_t pgrp, int sig);
mode_t umask(mode_t mask);
int pipe(int pipefd[2]);
pid_t fork(void);
pid_t vfork(void);
int execve(const char *pathname, char *const argv[], char *const envp[]);
int execvp(const char *file, char *const argv[]);
pid_t wait(int *wstatus);
pid_t waitpid(pid_t pid, int *wstatus, int options);
int dup(int oldfd);
int dup2(int oldfd, int newfd);
int mkstemp(char *template);

struct rlimit;
int getrlimit(int resource, struct rlimit *rlim);
int setrlimit(int resource, const struct rlimit *rlim);

#ifdef __cplusplus
}
#endif

#endif /* __ASSEMBLER__ */
#endif /* MAKE_WASI_COMPAT_H */
