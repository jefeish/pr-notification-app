## Pull Request - `mergable_state`
Each value describes the current state of the `pull request` in terms of **mergeability**:

- **clean:** Mergeable and passing commit status.
- **unstable:** Mergeable with non-passing commit status.
- **dirty:** The merge commit cannot be cleanly created.
- **unknown:** The state cannot currently be determined (often still being calculated).
- **blocked:** The merge is blocked (e.g., by required reviews or checks).
- **behind:** The head ref is out of date.
- **divergent:** The head branch has diverged from the base branch.
- **has_hooks:** Mergeable with passing commit status and pre-receive hooks.