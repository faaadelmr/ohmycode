# Fix Directory Diff in Git Changes

## Goal
Fix the issue where untracked directories show `0+ 0-` and no content in the diff view.

## Requirements
- Identify if a change entry is a directory.
- For untracked directories, list the files inside as additions in the diff view.
- Ensure `fs.readFileSync` is not called on directories.
- Calculate `diffStats.additions` by counting lines in all files within the untracked directory (recursively or just the list of files).
- If recursive is too slow, just list the file paths.

## Acceptance Criteria
- [ ] Untracked directories show their contents in the diff view.
- [ ] No more `0+ 0-` for untracked folders with content.
- [ ] No crashes or silent failures when encountering directories.

## Technical Notes
- File: `src/routes/api/git/+server.ts`.
- Use `fs.lstatSync(fullPath).isDirectory()` to check.
- Use a helper to recursively get all files in a directory for the diff content.
