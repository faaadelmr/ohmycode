# Fix Git Commit Logic in TaskForm

## Goal
Fix the issue where the Git commit functionality in "Add Ticket" (TaskForm) does not correctly target only the selected files, and ensure the selection state is managed correctly during file movements.

## Requirements
- Update the Git API `POST` handler to only commit the files provided in the `files` array, if present.
- If `files` is provided, the `git commit` command should include those files as arguments to ensure only they are committed.
- Fix `TaskForm.svelte` to maintain or automatically set selection state when moving files (Stage All / Unstage All).
- Ensure that if files are selected, they are correctly passed to the backend for committing.

## Acceptance Criteria
- [ ] Git commit only includes the files selected in the Kanban form.
- [ ] Other staged files that were NOT selected in the form are NOT committed.
- [ ] Clicking "Stage All" or "Unstage All" keeps the files selected (or selects them) so they are ready to be committed with the ticket.
- [ ] Individual file staging/unstaging also preserves/updates selection state logically.

## Technical Notes
- Backend: Update `src/routes/api/git/+server.ts` to pass `${filesArgs}` to `git commit`.
- Frontend: Update `moveAll` and `moveFile` in `TaskForm.svelte` to set `selected: true` when moving to staged, and `selected: false` (or preserve) when moving to detected.
- Actually, moving to staged should probably select the file so it's included in the ticket by default.
