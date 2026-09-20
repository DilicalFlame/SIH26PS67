## Working on this repo

- All work happens inside WSL on the native ext4 filesystem (`~/...`).
  Never work under /mnt/c or /mnt/p. It is a 10–40x I/O penalty on this project.
- Open VS Code with `code .` from native WSL bash, not from a Windows path -
  opening the folder via `\\wsl.localhost\...` from PowerShell/Explorer
  silently creates a Windows-side session with 9P bridge overhead instead,
  which erases the ext4 speed advantage the moment VS Code touches a file.
- Copy `.env.example` to `.env` at the repo root once (never commit `.env`).
- `docker compose --env-file .env -f infra/docker/compose.yml up -d` before
  starting the app - brings up postgres, minio, minio-init, and api (with
  reload already on via a bind-mount, see apps/api/Dockerfile.dev).
- `pnpm install && pnpm dev` at repo root runs web via turbo.
- Prefer running the API directly on the host instead (e.g. for a debugger):
  `cd apps/api && uv sync && uv run uvicorn app.main:app --reload` - stop the
  compose `api` service first so they don't fight over port 8000.

## Branches and PRs

- Branch from main: `<type>/<issue>-<slug>`, e.g. `feat/42-colorbar-uniforms`
  Types: feat, fix, chore, docs, refactor
- PR title: `<type>: <what changed>`. PR body must contain `Closes #<issue>`
- CI must be green. One approval, then self-merge.
- Do not refactor outside the scope of your issue.

## Commit messages

- Imperative mood, present tense: "add X", not "added X" or "adds X".
- One logical change per commit - don't fold an unrelated fix into a
  feature commit just because you noticed it along the way.
- Subject line: `<type>(#<issue>): <what changed>`, same `<type>` as the
  PR title, e.g. `fix(#57): make tile opacity actually blend`.
- Put the *why* in the body when it isn't obvious from the diff - the
  diff already shows *what* changed, so don't just restate it.

## Before you start a task

1. Read the acceptance criteria. If they are ambiguous, comment before coding.
2. Check `docs/planning/01-contracts.md` for the interface you are building against.
3. If the thing you need does not exist yet, build against the fixture in `fixtures/`
   and add the `blocked` label with the issue number you are waiting on.
