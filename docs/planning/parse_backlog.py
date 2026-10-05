#!/usr/bin/env python3
"""
parse_backlog.py - turn 04-master-backlog.md into issues.json

Extracts every "### T0XX - Title" block plus its metadata line
(`area:x` `size:Y` `M#` · dep: ... · demo: yes/no), an optional
"**Blocks:**" line, and the Outcome / Notes / AC sections. Also
extracts the epic table at the top so epics can be created first
with the right child ranges and milestone.

Usage:
    python3 parse_backlog.py 04-master-backlog.md > issues.json

Output shape:
{
  "epics": [ {"key": "E01", "title": "...", "milestone": "M0",
              "child_range": ["T001","T009"]}, ... ],
  "tasks": [ {"id": "T001", "title": "...", "area": "infra",
              "size": "S", "milestone": "M0", "deps": ["T002"],
              "blocks": [], "demo": false, "body_md": "..."}, ... ]
}

Nothing here talks to GitHub. This only produces data for
create_issues.py to consume.
"""
import json
import re
import sys

# Dash-like and dot-like separators are matched permissively (a class of
# characters, not one exact codepoint) because copy/paste, terminals, and
# "clean my text" tools routinely flatten em dash (-, U+2014), en dash
# (–, U+2013), and middle dot (·, U+00B7) down to a plain hyphen. Relying
# on the exact byte silently zeroes out every match if that happens -
# which is exactly what broke on a mangled copy of this file: 26 epics
# parsed fine (their separator survived) but every one of 214 tasks
# vanished with no error, only a quiet "0 tasks" in the summary line.
DASH = r"[-–\-]"      # em dash, en dash, or plain hyphen
DOT = r"[·\-]"        # middle dot or plain hyphen

TASK_HEADER = re.compile(rf"^### (T\d{{3}})\s*{DASH}\s*(.+)$")
META_LINE = re.compile(
    rf"^`area:(?P<area>[a-z]+)`\s+`size:(?P<size>XS|S|M|L|TOO BIG.*)`\s+"
    rf"`(?P<milestone>M\d)`\s+{DOT}\s+dep:\s*(?P<dep>.+?)\s+{DOT}\s+demo:\s*(?P<demo>yes|no)"
)
BLOCKS_LINE = re.compile(r"^\*\*Blocks:\*\*\s*(.+)$")
EPIC_ROW = re.compile(
    rf"^\|\s*(E\d{{2}})\s*\|\s*(.+?)\s*\|\s*(M\d)\s*\|\s*(T\d{{3}}){DASH}(T\d{{3}})\s*\|$"
)
TREF = re.compile(r"T\d{3}")
TRANGE = re.compile(rf"(T\d{{3}}){DASH}(T\d{{3}})")


def expand_refs(raw: str) -> tuple[list[str], bool]:
    """Expand 'T018–T034' style ranges into every id in between.
    Returns (ids, had_unresolvable_prose) - the second flag is True
    when the line contains free text (e.g. 'and every UI task after
    it') that can't be resolved to explicit ids."""
    ids: set[str] = set()
    remainder = raw
    for m in TRANGE.finditer(raw):
        lo, hi = int(m.group(1)[1:]), int(m.group(2)[1:])
        for n in range(lo, hi + 1):
            ids.add(f"T{n:03d}")
        remainder = remainder.replace(m.group(0), "")
    for t in TREF.findall(remainder):
        ids.add(t)
    # crude check: strip known ids and punctuation/parens, anything
    # left with letters means there was unresolvable prose
    stripped = TRANGE.sub("", raw)
    stripped = TREF.sub("", stripped)
    had_prose = bool(re.search(r"[A-Za-z]{3,}", stripped))
    return sorted(ids), had_prose


def extract_epics(text: str) -> list[dict]:
    epics = []
    for line in text.splitlines():
        m = EPIC_ROW.match(line.strip())
        if m:
            key, title, milestone, start, end = m.groups()
            epics.append({
                "key": key,
                "title": title.strip(),
                "milestone": milestone,
                "child_range": [start, end],
            })
    return epics


def extract_tasks(text: str) -> list[dict]:
    lines = text.splitlines()
    # A task's content ends at the next heading of ANY level - not just
    # the next task header. Missing this was a real bug: epic ("## E-")
    # and milestone ("# M-") headings, plus their intro text, sit between
    # some tasks in the source doc, and the task immediately before one
    # of those headings was silently swallowing it into its own body.
    # The last task in the file (T214) has no heading after it at all,
    # so it swallowed everything through the end of the document -
    # all four Appendix sections.
    ANY_HEADING = re.compile(r"^#{1,6}\s")
    heading_idxs = sorted(i for i, l in enumerate(lines) if ANY_HEADING.match(l))

    header_idxs = [i for i in heading_idxs if TASK_HEADER.match(lines[i])]

    tasks = []
    for n, start in enumerate(header_idxs):
        # end = the next heading of any kind after this task's own header,
        # not necessarily the next *task* header.
        later_headings = [h for h in heading_idxs if h > start]
        end = later_headings[0] if later_headings else len(lines)
        block = lines[start:end]

        header_m = TASK_HEADER.match(block[0])
        task_id, title = header_m.groups()

        # Meta line is normally block[1], but be tolerant of a blank line
        meta_m = None
        meta_idx = None
        for j in range(1, min(4, len(block))):
            meta_m = META_LINE.match(block[j].strip())
            if meta_m:
                meta_idx = j
                break
        if not meta_m:
            print(f"WARN: no meta line found for {task_id}", file=sys.stderr)
            continue

        dep_raw = meta_m.group("dep").strip()
        deps = [] if dep_raw.lower() == "none" else TREF.findall(dep_raw)

        blocks: list[str] = []
        blocks_note = ""
        body_start = meta_idx + 1
        # Optional **Blocks:** line immediately after the meta line
        for j in range(body_start, min(body_start + 3, len(block))):
            bm = BLOCKS_LINE.match(block[j].strip())
            if bm:
                blocks, had_prose = expand_refs(bm.group(1))
                if had_prose:
                    blocks_note = bm.group(1).strip()
                body_start = j + 1
                break

        body_md = "\n".join(block[body_start:]).strip()

        tasks.append({
            "id": task_id,
            "title": title.strip(),
            "area": meta_m.group("area"),
            "size": meta_m.group("size"),
            "milestone": meta_m.group("milestone"),
            "deps": sorted(set(deps)),
            "blocks": sorted(set(blocks)),
            "blocks_note": blocks_note,  # unresolvable prose, if any
            "demo": meta_m.group("demo") == "yes",
            "body_md": body_md,
        })

    return tasks


def main():
    if len(sys.argv) != 2:
        print("usage: parse_backlog.py 04-master-backlog.md", file=sys.stderr)
        sys.exit(1)

    text = open(sys.argv[1], encoding="utf-8").read()
    epics = extract_epics(text)
    tasks = extract_tasks(text)

    # Hard sanity floor. The soft id-contiguity check below is silently
    # satisfied by an empty list (expected_ids and got_ids are both the
    # empty set), which is exactly the failure mode that let a 0-task
    # parse slip through as "valid" output before. Epics declare how
    # many tasks *should* exist via their child_range spans - use that
    # as an independent cross-check and refuse to emit output if the
    # actual count is nowhere close.
    expected_from_epics = sum(
        int(e["child_range"][1][1:]) - int(e["child_range"][0][1:]) + 1
        for e in epics
    )
    raw_header_count = sum(
        1 for line in text.splitlines() if re.match(r"^### T\d{3}\b", line)
    )
    if epics and len(tasks) < 0.9 * expected_from_epics:
        print(
            f"ERROR: parsed only {len(tasks)} tasks, but the epic table "
            f"implies {expected_from_epics} should exist.\n"
            f"       {raw_header_count} lines start with '### T###' at all, "
            f"which tells you whether headers exist but aren't matching,\n"
            f"       or whether the task sections themselves are missing "
            f"from this file.\n"
            f"       The most common cause: the em dash (-) or middle dot "
            f"(·) in the source markdown got flattened to a plain hyphen\n"
            f"       by copy/paste, a terminal, or an editor's 'smart "
            f"punctuation' cleanup. Check with:\n"
            f"         python3 -c \"import sys; l=[x for x in open(sys.argv[1],encoding='utf-8') if x.startswith('### T017')][0]; "
            f"print([hex(ord(c)) for c in l if ord(c)>127])\" {sys.argv[1]}\n"
            f"       Expect to see 0x2014 (em dash) in that output. If you "
            f"see nothing or a different codepoint, the file was altered\n"
            f"       after I generated it - re-download 04-master-backlog.md "
            f"fresh rather than re-typing or re-pasting it.",
            file=sys.stderr,
        )
        sys.exit(1)

    expected_ids = {f"T{n:03d}" for n in range(1, len(tasks) + 1)}
    got_ids = {t["id"] for t in tasks}
    if expected_ids != got_ids:
        missing = sorted(expected_ids - got_ids)
        extra = sorted(got_ids - expected_ids)
        print(f"WARN: id mismatch. missing={missing} extra={extra}", file=sys.stderr)

    print(json.dumps({"epics": epics, "tasks": tasks}, indent=2))
    print(f"Parsed {len(epics)} epics and {len(tasks)} tasks.", file=sys.stderr)


if __name__ == "__main__":
    main()
