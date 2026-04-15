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
