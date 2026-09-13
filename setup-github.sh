#!/usr/bin/env bash
# Thalassa - one-shot GitHub repo setup: labels + milestones.
# Idempotent: safe to re-run. Uses --force so it overwrites existing
# labels (bug/documentation/enhancement ship with every new repo).
#
# Prereqs:  gh auth login
# Usage:    ./setup-github.sh [owner/repo]
#           defaults to the repo in the current directory

set -euo pipefail

REPO="${1:-}"
if [[ -n "$REPO" ]]; then
  export GH_REPO="$REPO"
fi

echo "==> Target: $(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo

# ---------------------------------------------------------------- labels
# create <name> <hex> <description>
create() {
  gh label create "$1" --color "$2" --description "$3" --force >/dev/null
  printf '  %-22s %s\n' "$1" "#$2"
}

echo "==> Type labels"
create "epic"              "3E4B9E" "Groups related tasks; body is a task list"
create "task"              "0E8A16" "Planned implementation work"
create "bug"               "D73A4A" "Something is broken"
create "enhancement"       "A2EEEF" "Proposed capability or improvement"
create "documentation"     "0075CA" "Docs: missing, wrong, or unclear"
create "performance"       "FBCA04" "Slowdown, regression, or optimisation"
create "spike"             "C5DEF5" "Time-boxed investigation; output is a decision"
echo

echo "==> Area labels"
for area in infra contracts rendering frontend backend data ai design docs; do
  create "area:${area}" "5319E7" "Area: ${area}"
done
echo

echo "==> Status labels"
create "blocked"           "B60205" "Waiting on another issue; body names which"
create "needs-design"      "D4C5F9" "Cannot start until a design spec exists"
create "good-first-task"   "7057FF" "Self-contained, low context required"
create "demo-critical"     "FF0000" "On the demo storyboard; a regression breaks the demo"
create "deferred"          "CFD3D7" "Deliberately not doing this now; body says why"
echo

echo "==> Size labels"
create "size:XS" "BFD4F2" "Under 2 hours"
create "size:S"  "BFD4F2" "About half a day"
create "size:M"  "BFD4F2" "About 1 day"
create "size:L"  "BFD4F2" "About 2 days"
echo

# ------------------------------------------------------------ milestones
# Adjust these dates before running if your schedule differs.
milestone() {
  local title="$1" due="$2" desc="$3"
  # Skip if a milestone with this title already exists (gh api has no upsert)
  if gh api "repos/{owner}/{repo}/milestones?state=all" \
       --jq '.[].title' 2>/dev/null | grep -Fxq "$title"; then
    printf '  %-32s (exists, skipped)\n' "$title"
    return
  fi
  gh api "repos/{owner}/{repo}/milestones" \
    -f title="$title" \
    -f due_on="${due}T23:59:59Z" \
    -f description="$desc" >/dev/null
  printf '  %-32s due %s\n' "$title" "$due"
}

echo "==> Milestones"
milestone "M0 - Foundation"              "2026-09-13" "CI, contracts, schema, compose, auth stub. Nobody blocked on anybody."
milestone "M1 - Internals demo"          "2026-09-16" "Scripted vertical slice plus deck."
milestone "M2 - Data & rendering core"   "2026-10-09" "Martin, Cache, datasets, 3D, auth, standards."
milestone "M3 - AI & research workflow"  "2026-10-23" "Tree chat memory, agent tools, semantic search, activities."
milestone "M4 - Research output"         "2026-11-06" "Living papers, citations, publishing."
milestone "M5 - Hardening & delivery"    "2026-11-13" "Deploy, plugins, performance, accessibility."
echo

echo "==> Done."
echo
echo "Verify:  gh label list --limit 50"
echo "         gh api repos/{owner}/{repo}/milestones --jq '.[].title'"
echo
echo "Next:    create the 26 epics, then T001-T214 from 04-master-backlog.md"