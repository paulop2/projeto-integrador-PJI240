---
name: implement-github-issue
description: Implement an existing GitHub issue end to end in an isolated worktree, from live backlog inspection through a verified pull request and handoff. Use for implementation requests; skip status-only, issue-authoring, and planning-only work.
---

# Implement GitHub Issue

Deliver the requested issue as a review-ready pull request unless the user names an earlier stop point. Implementation authorizes the normal repository workflow: worktree, code or documentation changes, verification, commit, push, PR, and required backlog or handoff updates. Merge, deployment, release, promotion, rollback, and unrelated backlog changes require separate authorization.

## Establish live state

1. Locate a checkout of the requested repository. Read every applicable `AGENTS.md` and any workflow it names before changing Git or GitHub state.
2. Resolve the issue number and repository from the request. Confirm the checkout belongs to that repository.
3. From that checkout, run the skill's context collector before creating a branch or worktree:

   ```powershell
   powershell -NoProfile -File <skill-directory>\scripts\Get-IssueContext.ps1 -IssueNumber <number> -Repository <owner/repo>
   ```

4. Inspect the issue, parent, dependencies, milestone, Project fields, comments, handoffs, closing PRs, cross-referenced PRs, dirty state, branches, and worktrees. A cross-reference is evidence to inspect, not proof that the PR implements the issue.
5. Stop when the issue or an implementing PR already completed the requested work. Resume existing work only when its ownership and local state are safe and clear. Treat a relevant open blocker as a delivery gate unless the repository explicitly permits parallel progress.

Follow every collector warning with a direct `gh` query. Missing optional data is unknown, not empty.

## Isolate and implement

1. Fetch the remote base required by the repository workflow. Reuse a clearly matching worktree or create an issue-specific branch and worktree from the current remote base. Preserve unrelated and dirty worktrees.
2. Re-read applicable instructions inside the worktree. Turn each acceptance criterion into a change and a way to verify it; record a plan only where the repository requires one.
3. Trace the behavior across the boundaries relevant to this issue, then implement the smallest coherent change. Record adjacent defects as follow-up work instead of expanding scope.
4. Add focused tests when executable behavior changes. For documentation, configuration, or metadata-only work, use the checks appropriate to that artifact.
5. Keep the diff intentional: exclude unrelated formatting, generated output, secrets, and transient files.

## Verify and deliver

1. After the final edit, run the focused checks plus repository-required lint, typecheck, build, or integration checks. Run `git diff --check`, inspect the complete diff against every acceptance criterion, and directly verify user-visible behavior when automation does not cover it.
2. Treat skipped or unavailable checks as evidence gaps. Leave the PR draft when a criterion or required verification remains unresolved.
3. Commit with the repository's existing Git identity. Push the issue branch and create the PR against the required base using the repository template and closing syntax.
4. Map acceptance criteria to the changes, record exact verification evidence and known limits, and perform workflow-required Project or handoff updates. Re-query mutated GitHub state before reporting it.

Finish when every in-scope criterion is represented in the intentional, committed, pushed diff; fresh evidence supports the claims; and the correctly based PR and required handoff are ready for review. If the user chose an earlier stop point, state what remains. Leave merge and deployment untouched without separate authorization.
