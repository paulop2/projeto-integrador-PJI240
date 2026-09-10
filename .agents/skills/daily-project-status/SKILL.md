---
name: daily-project-status
description: Report live GitHub Project status and recommend which executable issues to assign now, sequence, or run in parallel. Use for daily project check-ins, current backlog status, next work, or agent allocation; read-only.
---

# Daily Project Status

Produce a read-only start-of-day dispatch brief from live GitHub and local worktree state. Read applicable `AGENTS.md` files and the repository workflow first.

Run the bundled collector from the target repository checkout:

```powershell
powershell -NoProfile -File <skill-directory>\scripts\Get-DailyProjectStatus.ps1
```

Pass `-ProjectNumber` and `-ProjectOwner` only when automatic Project discovery is ambiguous. Follow every collector warning with a direct `gh` query before recommending work.

Use these dispatch rules:

- Assign only executable issues in `groups.dispatchable`: Project status `Ready`, no open blocker, open closing PR, or matching worktree.
- Treat `groups.active` as continuation work and `groups.review` as review work; do not create a duplicate agent assignment.
- Treat unblocked `Backlog` items as grooming candidates, not ready assignments. Epics organize work and are not assigned as implementation units.
- A dependency path in either direction makes two issues sequential.
- No dependency path is necessary but not sufficient for parallel work. Compare their acceptance criteria and boundaries: shared contracts, migrations, persisted state, generated data, or the same UI flow require coordination. Call work parallel-safe only when those collision risks are absent; otherwise label it parallel-with-coordination and explain the seam.

Return a compact brief with the snapshot time, work already active or in review, issues assignable now in priority order, blocked issues and what unlocks them, and a parallelism table. Link issue and PR numbers. State uncertainty instead of guessing when Project data, dependencies, or scope are incomplete. Do not mutate issues, Project fields, assignments, branches, or PRs unless the user separately asks.
