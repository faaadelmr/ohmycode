# Fix New File Diff and Watcher Crash

## Goal
Fix the issue where new files do not show their content in the diff (showing 0+ 0-) and fix the crash in the file watcher when `filename` is null.

## Requirements
- Fix `src/routes/api/git/watch/+server.ts` to handle null `filename` in the watcher callback.
- Fix `src/routes/api/git/+server.ts` to generate a proper diff for new files (untracked or added).
- New files should show their full content with `+` prefixes in the diff.
- `diffStats` should correctly count the lines in new files as additions.

## Acceptance Criteria
- [ ] Watcher no longer crashes with `TypeError`.
- [ ] New files (e.g., untracked files) show their content in the "Detected Changes" diff.
- [ ] Staged new files show their content in the "Staged Changes" diff.
- [ ] Additions count matches the number of lines in the new file.

## Technical Notes
- Watcher: Move null check to the top of the callback.
- Git API: Use `git diff --no-index /dev/null "$file"` or manually build the diff for new files.
- Manual diff build: Read file, prefix lines with `+`, and set stats.
