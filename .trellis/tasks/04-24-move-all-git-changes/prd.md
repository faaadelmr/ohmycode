# Add Move All to Git Changes

## Goal
Add buttons to move all files between "Staged Changes" and "Detected Changes" sections in the `TaskForm` component.

## Requirements
- Add a "Move All to Detected" (Unstage All) button in the "Staged Changes" section.
- Add a "Move All to Staged" (Stage All) button in the "Detected Changes" section.
- Update the backend API (`/api/git`) to support bulk staging/unstaging.
- Update the frontend to call this new bulk functionality.
- UI should be consistent with the existing "Select All" style.

## Acceptance Criteria
- [ ] Clicking "Move All to Detected" unstages all files in the project.
- [ ] Clicking "Move All to Staged" stages all files in the project.
- [ ] UI reflects changes immediately (optimistic update or fast sync).
- [ ] UI remains clean and premium.

## Technical Notes
- Backend: Modify `PUT` in `src/routes/api/git/+server.ts` to support an `all` flag.
- Frontend: `src/lib/components/TaskForm.svelte`.
- Function to add: `moveAll(toStaged: boolean)`.
