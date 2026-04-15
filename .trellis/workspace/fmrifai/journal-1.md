# Journal - fmrifai (Part 1)

> AI development session journal
> Started: 2026-04-14

---



## Session 1: Integrate Git Tracking into Kanban

**Date**: 2026-04-14
**Task**: Integrate Git Tracking into Kanban

### Summary

Added API to scan project changes via Git and folder tracking. Updated TaskForm to suggest cards based on detected file/function changes. Added description field for detailed duty tracking.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: Overhaul Git Tracking with Folder Selection

**Date**: 2026-04-14
**Task**: Overhaul Git Tracking with Folder Selection

### Summary

Revamped the Git integration to allow users to specify any project folder. The system now reads .git status from the specified path, provides uncommitted change suggestions, and shows recent commit history for better card descriptions.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Native Folder Picker & Multi-select Changes

**Date**: 2026-04-14
**Task**: Native Folder Picker & Multi-select Changes

### Summary

Implemented a native Windows folder picker via PowerShell API. Added multi-select functionality for project changes, allowing users to batch multiple files into a single Kanban card with combined metadata.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: Robust Folder Picker Implementation

**Date**: 2026-04-14
**Task**: Robust Folder Picker Implementation

### Summary

Fixed the folder picker by using a more robust PowerShell command that handles window focus and STA requirements correctly. This provides a native Windows folder selection experience as requested.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: Improved Folder Picker (Shell.Application)

**Date**: 2026-04-14
**Task**: Improved Folder Picker (Shell.Application)

### Summary

Switched to Shell.Application COM object for folder picking to avoid WinForms initialization issues. This provides a more reliable folder selection dialog on Windows.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: Encoded PowerShell Picker Fix

**Date**: 2026-04-14
**Task**: Encoded PowerShell Picker Fix

### Summary

Fixed PowerShell parsing errors by using -EncodedCommand. This ensures the script is passed to PowerShell exactly as written, bypassing all shell escaping and syntax issues.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: Navbar Hero Integration & Theme Switcher Fix

**Date**: 2026-04-15
**Task**: Navbar Hero Integration & Theme Switcher Fix

### Summary

Moved Hero section content into the sticky navigation bar for a more compact and professional look. Fixed DaisyUI theme switcher using Svelte 5 reactive effects for persistent and smooth theme transitions.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: Enhanced Visuals with Icons

**Date**: 2026-04-15
**Task**: Enhanced Visuals with Icons

### Summary

Added SVG icons across the dashboard, form labels, and log cards to create a more 'awesome' and professional look. Renamed fields to 'TITLE' and 'DETAIL CODE' as requested.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: Local File Persistence & Rich Icons

**Date**: 2026-04-15
**Task**: Local File Persistence & Rich Icons

### Summary

Implemented server-side file persistence. Tickets are now automatically saved as Markdown files in the project's 'daily-logs/YYYYMMDD/' folder. Added rich SVG icons to all form fields and log cards for an 'awesome' visual experience.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: Fixed Log Sorting

**Date**: 2026-04-15
**Task**: Fixed Log Sorting

### Summary

Ensured that the Recent Log History is always sorted by the most recent timestamp first, providing a proper chronological view of daily worker activities.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: Centralized Log Storage

**Date**: 2026-04-15
**Task**: Centralized Log Storage

### Summary

Moved Markdown log persistence from the individual project folders to a centralized location in the user's home directory: ~/.ohmycode/logs/. Files are organized by Project Name and Date for better portability across different projects and PCs.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: Enhanced Local Backup with Files

**Date**: 2026-04-15
**Task**: Enhanced Local Backup with Files

### Summary

Updated the centralized storage API to not only save the Markdown log but also copy the actual source files involved in the task. Files are now backed up in ~/.ohmycode/logs/[Project]/[Date]/files/ maintaining their original directory structure.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: Full Deletion Sync

**Date**: 2026-04-15
**Task**: Full Deletion Sync

### Summary

Implemented automatic disk cleanup. When a log entry is deleted from the UI, the system now automatically deletes the corresponding .md report and backed up files from the centralized ~/.ohmycode storage directory.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 14: Integrated Git Diff Details

**Date**: 2026-04-15
**Task**: Integrated Git Diff Details

### Summary

Updated Git API to fetch actual diff content. Form now shows line addition/deletion stats and a toggleable detailed diff view. Selecting a file now automatically summarizes the first 10 lines of its changes into the 'Detail Code' field for effortless reporting.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 15: Robust Folder Picker Fix

**Date**: 2026-04-15
**Task**: Robust Folder Picker Fix

### Summary

Addressed the 'stuck' folder picker by implementing a more advanced PowerShell script that uses Win32 API (SetForegroundWindow) to force the dialog to the front. Added ExecutionPolicy Bypass to ensure the script runs smoothly on all Windows systems.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 16: Cross-Platform Internal Folder Browser

**Date**: 2026-04-15
**Task**: Cross-Platform Internal Folder Browser

### Summary

Replaced the Windows-only PowerShell picker with a custom internal directory browser. This ensures folder selection works across Linux, Android, and Windows by navigating the file system directly through the web UI.

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
