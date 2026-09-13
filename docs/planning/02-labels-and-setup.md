# GitHub Setup: Labels, Milestones, Board

## 1. Add the task template

Save the provided `task.yml` as `.github/ISSUE_TEMPLATE/task.yml`.

**Also change `config.yml`.** It currently reads `blank_issues_enabled: false`, which means nobody on the team can open a quick note or a spike. With the task template added, keep it false (it forces structure, which is what you want) - but add contact links so there is a visible escape hatch:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Architecture or scope discussion
    url: https://github.com/DilicalFlame/SIH26PS67/discussions
    about: For open questions and design debates, not tracked work.
```

**Remove `needs-triage` from `task.yml`.** It exists for inbound reports from strangers. Tasks you wrote yourself are already triaged, and a label that is on every issue carries no information.

---

## 2. Labels

Create these once. Colours are suggestions; the grouping is what matters.

**Type** (exactly one per issue)
| Label | Colour | Meaning |
|---|---|---|
| `task` | `#0E8A16` | Planned implementation work |
| `bug` | `#D73A4A` | Something broken |
| `enhancement` | `#A2EEEF` | Proposed capability |
| `documentation` | `#0075CA` | Docs |
| `performance` | `#FBCA04` | Regression or optimisation |
| `spike` | `#C5DEF5` | Time-boxed investigation, output is a decision |

**Area** (exactly one per issue)

`area:infra` `area:contracts` `area:rendering` `area:frontend` `area:backend` `area:data` `area:ai` `area:design` `area:docs` - all `#5319E7`.

**Status** (zero or one)
| Label | Colour | Meaning |
|---|---|---|
| `blocked` | `#B60205` | Waiting on another issue; the issue body names which |
| `needs-design` | `#D4C5F9` | Cannot start until Nandini delivers a spec |
| `good-first-task` | `#7057FF` | Self-contained, low context required |
| `demo-critical` | `#FF0000` | On the internals storyboard - breaks the demo if it regresses |
| `deferred` | `#CFD3D7` | Deliberately not doing this now; body says why |

**Size** (exactly one)

`size:XS` `size:S` `size:M` `size:L` - all `#BFD4F2`.

`demo-critical` earns its alarming colour. During the last two days before internals it is the only filter anyone should be looking at.

---

## 3. Milestones

| Milestone | Due | Description |
|---|---|---|
| `M0 - Foundation` | Day 2 | CI, contracts, schema, compose, auth stub |
| `M1 - Internals demo` | Day 5 | Scripted vertical slice + deck |
| `M2 - Data & rendering core` | Week 4 | Martin, Cache, remaining datasets, isosurfaces, real auth |
| `M3 - AI & research workflow` | Week 6 | Tree chat, agent tools, semantic search |
| `M4 - Research output` | Week 8 | Living papers, citations, publishing |
| `M5 - Hardening & delivery` | Week 9 | Deploy, plugins, performance, docs |

---

## 4. Project board

One board, five columns: **Backlog → Ready → In progress → In review → Done**.

Two rules that matter more than the tooling:

- **"Ready" means genuinely unblocked.** Dependencies landed, design exists if needed, contract frozen. If someone has to ask a question before starting, it is not Ready.
- **Work-in-progress limit of 2 per person.** Five people times three open branches is how a five-day sprint produces nothing mergeable on day 5.

---

## 5. CONTRIBUTING.md - the short version

Put this in the repo so nobody has to ask:

```markdown
## Working on this repo

- All work happens inside WSL on the native ext4 filesystem (`~/...`).
  Never work under /mnt/c or /mnt/p - it is a 10–40x I/O penalty on this project.
- Open VS Code with `code .` from native WSL bash, not from a Windows path.
- `docker compose -f infra/docker/compose.yml up -d` before starting the app.
- `pnpm install && pnpm dev` at repo root runs web + api via turbo.
- Python apps use `uv`: `cd apps/api && uv sync && uv run uvicorn app.main:app --reload`

## Branches and PRs

- Branch from main: `<type>/<issue>-<slug>`, e.g. `feat/42-colorbar-uniforms`
  Types: feat, fix, chore, docs, refactor
- PR title: `<type>: <what changed>` - PR body must contain `Closes #<issue>`
- CI must be green. One approval, then self-merge.
- Do not refactor outside the scope of your issue.

## Before you start a task

1. Read the acceptance criteria. If they are ambiguous, comment before coding.
2. Check `docs/planning/01-contracts.md` for the interface you are building against.
3. If the thing you need does not exist yet, build against the fixture in `fixtures/`
   and add the `blocked` label with the issue number you are waiting on.
```
