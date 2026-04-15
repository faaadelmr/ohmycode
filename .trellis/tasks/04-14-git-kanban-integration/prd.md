# Integrate File and Git Tracking

## Goal
Transform the static Kanban board into a dynamic tool that tracks project file changes and Git history, automatically creating or updating "duty" cards based on development activity.

## Requirements
- **File System Monitoring:** Detect changes in the `src/` directory.
- **Git Integration:** Read recent commits or staged changes to pre-fill Kanban cards.
- **Automatic Card Creation:** Propose cards based on changed files and functions.
- **Detail Extraction:** Automatically extract function names or modified sections from files.
- **Persistence:** Maintain manual "Duty" descriptions alongside automated data.

## Technical Strategy
- **Backend (SvelteKit):** Create a SvelteKit API route (Server-only) to execute `git` commands and scan the file system.
- **Frontend:** Add a "Sync with Git/Folder" button or background sync logic.
- **State:** Update `kanbanStore` to handle automated metadata.

## Acceptance Criteria
- [ ] UI button to "Scan for Changes".
- [ ] Display a list of "Detected Changes" (Files & Functions).
- [ ] Ability to "Promote" a detected change to a Kanban card.
- [ ] Git commit messages can be used as initial descriptions.
- [ ] No performance regression on large folders.
