# Add Discard Changes to Detected Changes

## Goal
Add a "Discard Changes" feature to the "Detected Changes" section in the `TaskForm` component, allowing users to revert changes to individual files or all files in the section.

## Requirements
- Add a "Discard" button (trash icon) to each file card in the "Detected Changes" section.
- Add a "Discard All" button in the "Detected Changes" header.
- Implement a backend API endpoint to handle discarding changes.
- For tracked files: use `git checkout -- <file>` or `git restore <file>`.
- For untracked files: use `rm <file>`.
- Add a confirmation dialog or a simple confirm() before discarding (especially for "Discard All").
- UI should be consistent with the existing theme, using red/error colors for discard actions.

## Acceptance Criteria
- [ ] Users can discard changes to a single file in "Detected Changes".
- [ ] Users can discard all changes in "Detected Changes" with one click (after confirmation).
- [ ] Discarded files disappear from the list and the actual file on disk is reverted or deleted (if untracked).
- [ ] UI remains playful and premium.

## Technical Notes
- Backend: Add a new API endpoint `src/routes/api/git/discard/+server.ts`.
- Frontend: `src/lib/components/TaskForm.svelte`.
- Function to add: `discardChanges(fileName?: string)`.
