## Working on this repo

- All work happens inside WSL on the native ext4 filesystem (`~/...`).
  Never work under /mnt/c or /mnt/p. It is a 10–40x I/O penalty on this project.
- Open VS Code with `code .` from native WSL bash, not from a Windows path.
- `docker compose -f infra/docker/compose.yml up -d` before starting the app.
- `pnpm install && pnpm dev` at repo root runs web + api via turbo.
- Python apps use `uv`: `cd apps/api && uv sync && uv run uvicorn app.main:app --reload`

## Branches and PRs

- Branch from main: `<type>/<issue>-<slug>`, e.g. `feat/42-colorbar-uniforms`
  Types: feat, fix, chore, docs, refactor
- PR title: `<type>: <what changed>`. PR body must contain `Closes #<issue>`
- CI must be green. One approval, then self-merge.
- Do not refactor outside the scope of your issue.

## Before you start a task

1. Read the acceptance criteria. If they are ambiguous, comment before coding.
2. Check `docs/planning/01-contracts.md` for the interface you are building against.
3. If the thing you need does not exist yet, build against the fixture in `fixtures/`
   and add the `blocked` label with the issue number you are waiting on.
