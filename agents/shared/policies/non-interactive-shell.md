# Non-Interactive Shell Discipline

Every shell call must run to completion without waiting for stdin. A subagent
that hangs on a confirmation prompt burns the entire iteration budget for
nothing.

## Required flags by tool

| Tool       | Flag                                  | Notes                                      |
|------------|---------------------------------------|--------------------------------------------|
| `apt-get`  | `-y`                                  | also `DEBIAN_FRONTEND=noninteractive`      |
| `npm`      | `--yes` on init; no flag on install   | use `npm ci` not `npm install` in runs     |
| `pnpm`     | no prompt in CI; use `--frozen-lockfile` |                                         |
| `gh`       | `--yes` where applicable              | `gh repo create --confirm` on older vers.  |
| `git`      | set user.email and user.name upfront  | never rely on global config                |
| `vercel`   | `--yes --prod`                        | `--token $VERCEL_TOKEN` not interactive    |
| `psql`     | `-v ON_ERROR_STOP=1`                  | read SQL from `-f` file, not stdin         |
| `curl`     | `-sSf` for scripts                    | fail loudly, silent otherwise              |
| `rm`       | `-rf` only inside the run's workspace | never on paths containing `$HOME` unqualified |

## Forbidden patterns

- Any command that reads from stdin without the input being piped in advance.
- `sudo` prompts — elevation must be resolved before the run starts, not
  mid-run.
- Editors (`vim`, `nano`, `less`) — use `sed`, `awk`, or file writes.
- `ssh` without `-o BatchMode=yes -o StrictHostKeyChecking=accept-new`.
- Package managers prompting for y/N mid-install (see flag table above).

## Before running any shell command

1. Read the command as a whole. If any step could prompt, rewrite it.
2. Prefer one-shot commands (`gh repo create name --public -y`) over
   interactive wizards.
3. Route through the shell wrapper if one is provided — it auto-injects
   non-interactive flags and rejects commands that lack them.

## Git identity

Every git operation in this repo's pipelines must use:

```
git config user.email "polycarpohu@gmail.com"
git config user.name  "pinohu"
```

Vercel rejects other commit authors on `pa-crop-services`. Apply the same
discipline to every new repo to keep the policy uniform.
