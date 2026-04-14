# GEMINI.md

## Project Overview

**ohmycode** is a modern, playful, and colorful interactive web application built with **SvelteKit (Svelte 5)**. Its primary feature is a **Duty Kanban** system designed for developers to track their coding tasks ("duties"), including the specific files and functions they are working on.

### Core Technologies
- **Framework:** SvelteKit (Svelte 5 with Runes mode enabled)
- **Styling:** Tailwind CSS 4 + DaisyUI 5
- **Icons/Assets:** Custom SVG
- **State Management:** Svelte 5 `$state` and `$derived` runes, with persistence in `localStorage`.
- **Utilities:** `@faaadelmr/css-viewport` for normalized viewport height on mobile.
- **Workflow Harness:** Trellis (Mindfold AI) for agentic workflow management.

### Architecture
- **Frontend-First:** The application is currently a client-side focused SPA (using `adapter-auto`).
- **State Persistence:** Task data and UI themes are persisted in the browser's `localStorage`.
- **Theming:** Supports over 30 colorful themes via DaisyUI, managed through a Svelte store (`src/lib/theme.ts`).

---

## Building and Running

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Production
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Linting and Formatting
```bash
# Run ESLint and Prettier check
npm run lint

# Automatically format code
npm run format

# Run Svelte type checking
npm run check
```

---

## Development Conventions

### Svelte 5 Runes
This project strictly uses **Svelte 5 Runes** (`$state`, `$derived`, `$props`, etc.). Runes mode is enforced in `svelte.config.js` for all non-library files.

### Styling Patterns
- **Tailwind 4:** Uses the latest Tailwind CSS 4 features.
- **DaisyUI:** Leverages DaisyUI components and its extensive theme system.
- **Viewport Normalization:** Use the `.min-h-screen-vh` utility class (defined in `src/routes/layout.css`) for full-screen elements to ensure consistent height across mobile browsers, powered by the `--vh` variable calculated in `src/routes/+layout.svelte`.

### State Management
- **Kanban Store:** Located in `src/lib/kanban.svelte.ts`. Uses `$state` for task tracking and automatically syncs to `localStorage`.
- **Theme Store:** Located in `src/lib/theme.ts`. Uses a standard Svelte `writable` store for cross-component theme synchronization.

### Coding Standards
- **TypeScript:** Enforced for all logic and components.
- **Linting:** Standard ESLint configuration with Svelte and TypeScript plugins.
- **A11Y:** Ensure interactive elements have proper ARIA roles (e.g., `role="listitem"` for draggable Kanban cards).

---

## Trellis Workflow

The project uses the **Trellis** agent harness for structured development.

### Key Trellis Files
- `.trellis/workflow.md`: The primary development workflow guide. **READ THIS FIRST** when starting work.
- `.trellis/spec/`: Contains architectural and coding guidelines (Frontend/Guides).
- `.trellis/workspace/`: Personal journals and session history for developers/agents.
- `AGENTS.md`: Quick reference for AI assistants.

### Essential Commands
- `/trellis:start`: Initialize a new development session.
- `/trellis:onboard`: Onboard to the project context.
- `/trellis:finish-work`: Pre-commit checklist and session recording.
- `python ./.trellis/scripts/task.py`: Manage tasks (create, list, archive).
- `python ./.trellis/scripts/add_session.py`: Record session progress to your journal.

---

## Project Structure
```
ohmycode/
├── .agent/              # Antigravity workflow definitions
├── .gemini/             # Gemini CLI custom commands
├── .trellis/            # Trellis configuration, specs, and workspace
├── src/
│   ├── lib/
│   │   ├── components/  # Kanban UI components (Card, Column, Board, Form)
│   │   ├── assets/      # Static assets (favicon, etc.)
│   │   ├── kanban.svelte.ts # Kanban state logic
│   │   └── theme.ts     # Theme store logic
│   └── routes/
│       ├── +layout.svelte # Main app shell and theme syncing
│       ├── +page.svelte   # Kanban board page
│       └── layout.css     # Global styles and viewport utilities
└── static/              # Static files
```
