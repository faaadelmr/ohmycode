# Fix New File Diff Logic Again

## Goal
Fix the bug where untracked files still show 0+ 0- in the diff due to an incorrect status string check in `processSuggestion`.

## Requirements
- Update the status check for new files to correctly identify untracked files.
- Untracked files currently have status `?` in the suggestions list, but the check was looking for `??`.
- Ensure both `?` and `??` are treated as new files to generate the content diff.

## Acceptance Criteria
- [ ] Untracked files (status `??` in git) show their full content in the diff view.
- [ ] Statistics (additions) are correctly calculated for untracked files.

## Technical Notes
- File: `src/routes/api/git/+server.ts`.
- Change `change.status === '??'` to `change.status === '?' || change.status === '??'`.
