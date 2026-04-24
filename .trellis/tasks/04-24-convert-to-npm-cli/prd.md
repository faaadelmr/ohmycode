# Convert to npm CLI Package

## Goal
Transform the project into a globally installable npm package that runs as a CLI tool on a custom port and automatically opens the browser.

## Requirements
- Switch to `@sveltejs/adapter-node` for standalone server capabilities.
- Create a CLI entry point `bin/ohmycode.js`.
- Default port should be **9966**.
- CLI should automatically open the browser to the application URL.
- Update `package.json` with `bin` field and appropriate metadata.
- Set `"private": false` in `package.json` to allow publishing.

## Acceptance Criteria
- [ ] `npm run build` generates a working node server in `build/`.
- [ ] `node bin/ohmycode.js` starts the server on port 9966.
- [ ] Browser automatically opens to `http://localhost:9966` when the CLI starts.
- [ ] Command `ohmycode` is available globally after `npm link`.

## Technical Notes
- Dependencies: `@sveltejs/adapter-node`.
- Configuration: `svelte.config.js`.
- CLI Script: `bin/ohmycode.js` using `child_process.exec` to open browser.
