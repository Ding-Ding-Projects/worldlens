# Issue 62 cleanup ledger

This ledger records the repository-state evidence collected for issue 62. It is a planning and
handoff record only. It does not remove a checkout, delete a ref, merge a commit, or publish a
change.

## Evidence boundary

Inventory captured on 2026-08-19 after `git fetch origin` from the issue-62 checkout.

| Item | Value |
| --- | --- |
| Published default ref inspected | `origin/main` at `ac46de28bab162ab58e045e5e46af23620f07f54` |
| Issue-62 checkout | `codex/issue-62-merged-worktree-cleanup` at `ac46de28bab162ab58e045e5e46af23620f07f54` |
| Primary checkout | `main` at `f148a5385d801bd4c3acea2a5c417e7a70b0c900` |
| Primary checkout state | One untracked file: `scripts/public-compatibility-contract.test.mjs` |
| Stashes | None reported by `git stash list` |
| Submodule state | `vendor/BlueMap` is not initialized at the recorded gitlink `4c4cbc291b361ceff6ee239448e9f988f9019dbb`; no deletion is authorized by this ledger |

The local primary checkout is ahead of the fetched published default ref and is not a safe basis
for deletion. Its untracked file also requires ownership classification before any cleanup pass.

## Linked checkout inventory

`clean` means that checkout reported no uncommitted or untracked files at capture time. `ancestor`
means its current tip was proven with `git merge-base --is-ancestor <tip> origin/main`.

| Checkout | Ref | Tip | State | Ancestor of `origin/main` | Action in this ledger |
| --- | --- | --- | --- | --- | --- |
| `worldlens-all-issues-integration-20260819` | `codex/all-issues-integration-20260819` | `ac46de28` | clean | yes | Candidate only after owner confirmation |
| `worldlens-artifact-recovery-20260818` | `codex/worldlens-artifact-recovery-20260818` | `3b2486ce` | 14 changed paths | yes | Retain; preserve uncommitted work |
| `worldlens-fix-save-render-20260818` | `codex/fix-worldlens-save-render-20260818` | `2adea274` | 1 untracked capture | no | Retain; not an ancestor and has untracked work |
| `worldlens-issue-52-gh-release-routing` | `codex/issue-52-gh-release-routing` | `ac46de28` | 4 changed paths | yes | Retain; preserve uncommitted work |
| `worldlens-issue-57-cloud-first-config` | `codex/issue-57-cloud-first-config` | `1e74e2f6` | clean | yes | Candidate only after issue lane ownership and proof review |
| `worldlens-issue-58-render-console-history` | `codex/issue-58-render-console-history` | `ac46de28` | 3 changed paths | yes | Retain; preserve uncommitted work |
| `worldlens-issue-59-safe-product-migration` | `codex/issue-59-safe-product-migration` | `ac46de28` | clean | yes | Candidate only after owner confirmation |
| `worldlens-issue-60-public-compatibility-contract` | `codex/issue-60-public-compatibility-contract` | `ba265790` | clean | yes | Candidate only after issue lane ownership and proof review |
| `worldlens-issue-62-merged-worktree-cleanup` | `codex/issue-62-merged-worktree-cleanup` | `ac46de28` | clean | yes | Keep until this ledger is incorporated and the parent pass authorizes cleanup |
| `worldlens-issue-64-render-queue-persistence` | `codex/issue-64-render-queue-persistence` | `326fc6e5` | clean | yes | Candidate only after issue lane ownership and proof review |
| `worldlens-issue-65-cli-resource-sql-parity` | `codex/issue-65-cli-resource-sql-parity` | `fc8b3399` | clean | yes | Candidate only after issue lane ownership and proof review |
| `worldlens-issue-66-sql-cross-engine-proof` | `codex/issue-66-sql-cross-engine-proof` | `22488af6` | clean | yes | Candidate only after issue lane ownership and proof review |
| `worldlens-issue-68-render-priority-parity` | `codex/issue-68-render-priority-parity` | `2bb87a7e` | clean | yes | Candidate only after issue lane ownership and proof review |
| `worldlens-issue-78-render-engine-choice` | `codex/issue-78-render-engine-choice` | `8cbf12be` | 3 changed paths | yes | Retain; preserve uncommitted work |
| `worldlens-issue-89-typed-banner-patterns` | `codex/issue-89-typed-banner-patterns` | `0a23b8c6` | 14 changed paths | no | Retain; not an ancestor and has uncommitted work |
| `worldlens-issue-91-retire-local-webserver` | `codex/issue-91-retire-local-webserver` | `0eb136de` | clean | no | Retain; current local tip is not an ancestor |
| `worldlens-kids-mode-repair-20260818` | `codex/kids-mode-repair-20260818` | `3b2486ce` | 51 changed paths | yes | Retain; preserve uncommitted work |
| `worldlens-pages-template-hydration-20260818` | `fix/pages-template-hydration-20260818` | `59057c15` | 2 changed paths | no | Retain; not an ancestor and has uncommitted work |
| `worldlens-save-clone-20260818` | `codex/worldlens-save-clone-20260818` | `fe1dec62` | clean | no | Retain; not an ancestor |
| `worldlens-workflow-v2-20260818` | `codex/worldlens-workflow-v2-20260818` | `eb4272c8` | clean | no | Retain; not an ancestor |

The three-character tip values above are display abbreviations only; the full values are preserved
by the command output and must be re-read immediately before any future deletion decision.

## Remote-ref notes

The fetched remote refs include issue branches for 57, 60, 64, 65, 66, 68, 78, 88, 89, and 91.
The following remote refs were ancestors of `origin/main` at this capture: 57, 60, 64, 65, 66,
68, 78, 88, and 89. The remote ref for 91 was not an ancestor. This is ancestry evidence only;
it is not proof that a lane is inactive or that its checkout may be removed.

The local refs also include older task refs and integration refs. A future cleanup pass must repeat
the inventory after the parent integration work settles and must inspect each linked checkout's
current status, not rely on this snapshot.

## Draft issue update

> **Inventory refreshed — deletion not performed**
>
> On 2026-08-19, the cleanup inventory was refreshed after fetching `origin`. The fetched default
> ref was `ac46de28bab162ab58e045e5e46af23620f07f54`. Several linked checkouts are clean and their
> tips are ancestors of that ref, but several other checkouts contain uncommitted files, and the
> primary checkout contains an untracked script. The `vendor/BlueMap` gitlink is also uninitialized.
> No checkout, branch, tag, submodule, or stash was removed. The clean ancestor set is therefore
> only a candidate set pending ownership confirmation, a fresh inventory, and the parent cleanup
> authorization. The issue remains open.

## Required next evidence

1. Fetch `origin` again and rebuild this inventory after the parent integration lane settles.
2. Classify every uncommitted path and preserve work before any cleanup operation.
3. Confirm that each candidate is inactive, has no uncommitted, unmerged, or unpushed work, and is not
   load-bearing for a release or workflow.
4. Prove each retained candidate tip is an ancestor of the then-current published default ref.
5. Obtain fresh cleanup authorization for that exact candidate list, then let the parent workflow
   perform any approved deletion and publish a post-cleanup inventory.
