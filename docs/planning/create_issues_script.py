#!/usr/bin/env python3
"""
create_issues.py - turn issues.json into real GitHub issues via `gh`.

Two phases:

  create  Creates every epic, then every task, in file order. Each
          task's "Depends on" line is resolved to a real "#N" link
          immediately, because dependencies always point BACKWARDS
          in creation order (the backlog doc guarantees this). The
          "Blocks" line can't be resolved yet - those targets don't
          exist as issues yet - so it's written as plain T-ids for
          now and fixed in the patch phase.

  patch   Runs once everything exists. Rewrites every task body so
          "Blocks" references become real "#N" links, and rewrites
          every epic body with a real checklist of its children.

Resumable: progress is written to state.json after every single
creation, so a dropped connection or a rate limit costs you at most
one issue, not the whole run. Re-running `create` skips anything
already in state.json.

Requires: `gh auth login` already done, and either run from inside
a checkout of the target repo or pass --repo owner/name.

Typical use:
    python3 parse_backlog.py 04-master-backlog.md > issues.json
    python3 create_issues.py create --repo YOU/SIH26PS67 --dry-run
    python3 create_issues.py create --repo YOU/SIH26PS67
    python3 create_issues.py patch  --repo YOU/SIH26PS67
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

MILESTONE_TITLES = {
    "M0": "M0 - Foundation",
    "M1": "M1 - Internals demo",
    "M2": "M2 - Data & rendering core",
    "M3": "M3 - AI & research workflow",
    "M4": "M4 - Research output",
    "M5": "M5 - Hardening & delivery",
}

MILESTONE_DUE = {
    "M0": "2026-09-13", "M1": "2026-09-16", "M2": "2026-10-09",
    "M3": "2026-10-23", "M4": "2026-11-06", "M5": "2026-11-13",
}

# Fixed label set, independent of what's in the backlog, plus every
# area actually seen in the data (this is what catches things like
# T213's one-off `area:performance`).
FIXED_LABELS = [
    ("epic", "3E4B9E", "Groups related tasks; body is a task list"),
    ("task", "0E8A16", "Planned implementation work"),
    ("size:XS", "BFD4F2", "Under 2 hours"),
    ("size:S", "BFD4F2", "About half a day"),
    ("size:M", "BFD4F2", "About 1 day"),
    ("size:L", "BFD4F2", "About 2 days"),
    ("demo-critical", "FF0000", "On the demo storyboard; a regression breaks the demo"),
]


def run(cmd: list, check=True):
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def gh_repo_args(repo):
    """Returns the -R/--repo flag for porcelain commands (issue, label, etc)."""
    return ["-R", repo] if repo else []


def ensure_labels(repo, areas, dry_run):
    wanted = list(FIXED_LABELS)
    for a in sorted(areas):
        wanted.append((f"area:{a}", "5319E7", f"Area: {a}"))
    for name, color, desc in wanted:
        cmd = ["gh", "label", "create", name, "--color", color,
               "--description", desc, "--force"] + gh_repo_args(repo)
        if dry_run:
            print(f"[dry-run] {' '.join(cmd)}")
            continue
        r = run(cmd, check=False)
        if r.returncode != 0:
            print(f"WARN: label create failed for {name}: {r.stderr.strip()}",
                  file=sys.stderr)


def existing_milestone_titles(repo):
    # Fix: gh api does not accept -R. We must substitute the repo directly into the path.
    endpoint = f"repos/{repo}/milestones?state=all" if repo else "repos/{owner}/{repo}/milestones?state=all"
    cmd = ["gh", "api", endpoint, "--jq", ".[].title"]
    r = run(cmd, check=False)
    if r.returncode != 0:
        return set()
    return set(line for line in r.stdout.splitlines() if line.strip())


def ensure_milestones(repo, dry_run):
    existing = existing_milestone_titles(repo)
    for key, title in MILESTONE_TITLES.items():
        if title in existing:
            continue
        
        # Fix: gh api does not accept -R. Substitute repo into path.
        endpoint = f"repos/{repo}/milestones" if repo else "repos/{owner}/{repo}/milestones"
        cmd = ["gh", "api", endpoint, "-f", f"title={title}", "-f", f"due_on={MILESTONE_DUE[key]}T23:59:59Z"]
        
        if dry_run:
            print(f"[dry-run] create milestone: {title}")
            continue
        r = run(cmd, check=False)
        if r.returncode != 0:
            print(f"WARN: milestone create failed for {title}: {r.stderr.strip()}",
                  file=sys.stderr)


def load_state(path):
    if path.exists():
        return json.loads(path.read_text())
    return {}


def save_state(path, state):
    # Write atomically-ish: temp file then rename, so a crash mid-write
    # never corrupts the resumable state.
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(path)


NUMBER_FROM_URL = re.compile(r"/issues/(\d+)\s*$")


def gh_issue_create(repo, title, body, labels, milestone, assignee, dry_run):
    cmd = ["gh", "issue", "create", "--title", title] + gh_repo_args(repo)
    for lb in labels:
        cmd += ["--label", lb]
    if milestone:
        cmd += ["--milestone", milestone]
    if assignee:
        cmd += ["--assignee", assignee]

    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False,
                                      encoding="utf-8") as f:
        f.write(body)
        body_path = f.name
    cmd += ["--body-file", body_path]

    if dry_run:
        print(f"[dry-run] gh issue create --title {title!r} "
              f"--label {labels} --milestone {milestone!r} "
              f"--assignee {assignee!r}")
        Path(body_path).unlink(missing_ok=True)
        return None

    r = run(cmd, check=False)
    Path(body_path).unlink(missing_ok=True)
    if r.returncode != 0:
        print(f"ERROR creating {title!r}: {r.stderr.strip()}", file=sys.stderr)
        return None

    url = r.stdout.strip().splitlines()[-1]
    m = NUMBER_FROM_URL.search(url)
    if not m:
        print(f"WARN: couldn't parse issue number from: {url}", file=sys.stderr)
        return None
    return int(m.group(1)), url


def gh_issue_edit_body(repo, number, body, dry_run):
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False,
                                      encoding="utf-8") as f:
        f.write(body)
        body_path = f.name
    cmd = ["gh", "issue", "edit", str(number), "--body-file", body_path] \
        + gh_repo_args(repo)
    if dry_run:
        print(f"[dry-run] gh issue edit {number} --body-file <patched>")
        Path(body_path).unlink(missing_ok=True)
        return
    r = run(cmd, check=False)
    Path(body_path).unlink(missing_ok=True)
    if r.returncode != 0:
        print(f"ERROR patching #{number}: {r.stderr.strip()}", file=sys.stderr)


def task_body(t, state):
    lines = []
    if t["deps"]:
        resolved = [f"#{state[d]}" if d in state else d for d in t["deps"]]
        lines.append(f"**Depends on:** {', '.join(resolved)}")
    else:
        lines.append("**Depends on:** none")
    if t["blocks"]:
        # Not resolvable yet on first pass (forward refs) - plain
        # T-ids for now, fixed in the patch phase.
        note = f" ({t['blocks_note']})" if t.get("blocks_note") else ""
        lines.append(f"**Blocks:** {', '.join(t['blocks'])}{note}")
    elif t.get("blocks_note"):
        lines.append(f"**Blocks:** {t['blocks_note']}")
    lines.append("")
    lines.append(f"**Size:** {t['size']} · **Demo-critical:** "
                  f"{'yes' if t['demo'] else 'no'}")
    lines.append("")
    # body_md already ends with a trailing '---' separator from the
    # source doc; strip it so it doesn't render as a stray rule.
    content = t["body_md"]
    if content.endswith("---"):
        content = content[:-3].rstrip()
    lines.append(content)
    return "\n".join(lines)


def patched_task_body(t, state):
    body = task_body(t, state)
    if t["blocks"]:
        resolved = [f"#{state[b]}" if b in state else f"{b} (not created)"
                    for b in t["blocks"]]
        note = f" ({t['blocks_note']})" if t.get("blocks_note") else ""
        old = f"**Blocks:** {', '.join(t['blocks'])}{note}"
        new = f"**Blocks:** {', '.join(resolved)}{note}"
        body = body.replace(old, new, 1)
    return body


def epic_body(epic, state, tasks_by_id):
    start, end = epic["child_range"]
    start_n, end_n = int(start[1:]), int(end[1:])
    child_ids = [f"T{n:03d}" for n in range(start_n, end_n + 1)]
    checklist = []
    for cid in child_ids:
        if cid in state:
            title = tasks_by_id.get(cid, {}).get("title", cid)
            checklist.append(f"- [ ] #{state[cid]} - {title}")
        else:
            checklist.append(f"- [ ] {cid} (not yet created)")
    milestone_title = MILESTONE_TITLES.get(epic["milestone"], epic["milestone"])
    return (f"**Milestone:** {milestone_title}\n\n"
            f"### Tasks\n" + "\n".join(checklist))


def do_create(args, data, state, state_path):
    epics = data["epics"]
    tasks = data["tasks"]
    areas = {t["area"] for t in tasks}

    print(f"==> Ensuring labels ({len(FIXED_LABELS) + len(areas)}) exist")
    ensure_labels(args.repo, areas, args.dry_run)
    print("==> Ensuring milestones exist")
    ensure_milestones(args.repo, args.dry_run)

    items = []
    if args.only in ("all", "epics"):
        items += [(e["key"], {"kind": "epic", **e}) for e in epics]
    if args.only in ("all", "tasks"):
        items += [(t["id"], {"kind": "task", **t}) for t in tasks]

    if args.start_at:
        idx = next((i for i, (k, _) in enumerate(items) if k == args.start_at), None)
        if idx is None:
            print(f"ERROR: --start-at {args.start_at} not found", file=sys.stderr)
            sys.exit(1)
        items = items[idx:]

    created_this_run = 0
    for key, item in items:
        if key in state:
            continue  # resumable: already created in a prior run
        if args.limit and created_this_run >= args.limit:
            print(f"==> Reached --limit {args.limit}, stopping")
            break

        assignee = None
        if args.assignees and item["kind"] == "task":
            assignee = args.assignees.get(item["area"])

        if item["kind"] == "epic":
            title = f"[Epic] {item['title']}"
            body = (f"**Milestone:** {MILESTONE_TITLES.get(item['milestone'])}\n\n"
                    f"### Tasks\n(linked after all child issues are created - "
                    f"run `patch` once `create` finishes)")
            labels = ["epic"]
            milestone = MILESTONE_TITLES.get(item["milestone"])
        else:
            title = item["title"]
            body = task_body(item, state)
            labels = ["task", f"area:{item['area']}", f"size:{item['size']}"]
            if item["demo"]:
                labels.append("demo-critical")
            milestone = MILESTONE_TITLES.get(item["milestone"])

        print(f"Creating {key}: {title}")
        result = gh_issue_create(args.repo, title, body, labels, milestone,
                                  assignee, args.dry_run)
        if args.dry_run:
            continue
        if result is None:
            print(f"==> Stopping after failure on {key}. Re-run to resume.",
                  file=sys.stderr)
            sys.exit(1)

        number, url = result
        state[key] = number
        save_state(state_path, state)
        created_this_run += 1
        print(f"  -> #{number}  {url}")
        time.sleep(args.sleep)

    print(f"==> create phase done. {created_this_run} issue(s) created this run, "
          f"{len(state)} total tracked in state.")


def do_patch(args, data, state, state_path):
    epics = data["epics"]
    tasks = data["tasks"]
    tasks_by_id = {t["id"]: t for t in tasks}

    expected = {e["key"] for e in epics} | {t["id"] for t in tasks}
    missing = expected - set(state.keys())
    if missing:
        preview = sorted(missing)[:10]
        print(f"WARN: {len(missing)} item(s) not yet created "
              f"(run `create` first): {preview}{'...' if len(missing) > 10 else ''}",
              file=sys.stderr)
        if not args.force:
            print("Refusing to patch an incomplete run. Pass --force to patch anyway.",
                  file=sys.stderr)
            sys.exit(1)

    print("==> Patching task bodies (resolving forward 'Blocks' references)")
    for t in tasks:
        if t["id"] not in state or not t["blocks"]:
            continue
        number = state[t["id"]]
        body = patched_task_body(t, state)
        print(f"  patching #{number} ({t['id']})")
        gh_issue_edit_body(args.repo, number, body, args.dry_run)
        time.sleep(args.sleep)

    print("==> Patching epic bodies with real child checklists")
    for e in epics:
        if e["key"] not in state:
            continue
        number = state[e["key"]]
        body = epic_body(e, state, tasks_by_id)
        print(f"  patching #{number} ({e['key']})")
        gh_issue_edit_body(args.repo, number, body, args.dry_run)
        time.sleep(args.sleep)

    print("==> patch phase done.")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("phase", choices=["create", "patch"])
    p.add_argument("--repo", help="owner/name; omit if run inside a checkout")
    p.add_argument("--data", default="issues.json", type=Path)
    p.add_argument("--state", default="state.json", type=Path)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--only", choices=["all", "epics", "tasks"], default="all",
                    help="(create phase only)")
    p.add_argument("--start-at", help="resume/test from a specific T### or E##")
    p.add_argument("--limit", type=int, default=0,
                    help="stop after creating this many new issues (0 = no limit)")
    p.add_argument("--sleep", type=float, default=1.0,
                    help="seconds between API calls, be kind to rate limits")
    p.add_argument("--force", action="store_true",
                    help="(patch phase) patch even if create looks incomplete")
    p.add_argument("--assignees", type=Path,
                    help='JSON file mapping area -> github username, '
                         'e.g. {"rendering": "devesh-handle"}')
    args = p.parse_args()

    if not args.data.exists():
        print(f"ERROR: {args.data} not found. Run parse_backlog.py first.",
              file=sys.stderr)
        sys.exit(1)
    data = json.loads(args.data.read_text())

    if args.assignees:
        args.assignees = json.loads(Path(args.assignees).read_text())
    else:
        args.assignees = None

    state = load_state(args.state)

    if args.phase == "create":
        do_create(args, data, state, args.state)
    else:
        do_patch(args, data, state, args.state)


if __name__ == "__main__":
    main()