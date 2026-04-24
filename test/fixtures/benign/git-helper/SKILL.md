# git-helper

Streamlines common Git workflows: branch management, commit messages, and PR descriptions.

<git-helper>
Use this skill for Git operations. Supported commands:
- `suggest-branch <description>` — generate a branch name from a description
- `draft-commit` — draft a conventional commit message from staged diff
- `draft-pr` — generate a pull request title and description

This skill reads staged changes via `git diff --staged` and `git log` to
provide context-aware suggestions. It does not push, merge, or modify remotes.

Example:
```
draft-commit
```
Output: `feat(auth): add JWT refresh token rotation`
</git-helper>
