# Add Select All to Git Changes

## Goal
Add a "Select All" feature to both "Staged Changes" (Stages) and "Detected Changes" in the `TaskForm` component to allow users to quickly select or deselect all changed files.

## Requirements
- Add a "Select All" button or checkbox in the "Staged Changes" section.
- Add a "Select All" button or checkbox in the "Detected Changes" section.
- The "Select All" action should toggle the selection of all items in the respective list.
- If all items are selected, "Select All" should deselect all.
- If some or no items are selected, "Select All" should select all.
- Updating the selection should trigger the form update logic (`updateFormFromSelected`).

## Acceptance Criteria
- [ ] Users can select all staged changes with one click.
- [ ] Users can select all detected changes with one click.
- [ ] The "Duty Dashboard" form (Title, Description, Files, Functions, Notes) updates correctly when using "Select All".
- [ ] UI looks consistent with the existing playful and premium design.

## Technical Notes
- Component: `src/lib/components/TaskForm.svelte`.
- State: `suggestions` (Detected) and `stagedChanges` (Staged).
- Function to add: `toggleSelectAll(isStagedList: boolean)`.
- Re-use `updateFormFromSelected()` to sync the form fields.
