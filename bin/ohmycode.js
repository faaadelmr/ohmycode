#! /usr/bin/env node

import { spawn, exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../build/index.js');

if (!fs.existsSync(serverPath)) {
	console.error('Error: Build not found. Please run "npm run build" first.');
	process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
let port = process.env.PORT || 9966;

for (let i = 0; i < args.length; i++) {
	if (args[i] === '--port' || args[i] === '-p') {
		port = args[i + 1];
		break;
	}
}

process.env.PORT = port;

console.log(`\x1b[35m%s\x1b[0m`, `🌼 ohmycode starting on http://localhost:${port}...`);

const server = spawn('node', [serverPath], {
	detached: true,
	stdio: 'ignore',
	env: process.env
});

server.unref();

let childExited = false;
let exitCode = 0;

server.on('exit', (code) => {
	childExited = true;
	exitCode = code;
});

server.on('error', (err) => {
	childExited = true;
	console.error('Failed to start server:', err);
	process.exit(1);
});

// Wait a bit for server to start, then open browser
setTimeout(() => {
	if (childExited) {
		console.error(
			`Error: Server exited unexpectedly with code ${exitCode}. (Is the port ${port} already in use?)`
		);
		process.exit(1);
	}

	const url = `http://localhost:${port}`;
	const start =
		process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

	try {
		exec(`${start} ${url}`);
	} catch {
		console.log(`Could not open browser automatically. Please go to ${url}`);
	}

	console.log(`\x1b[32m%s\x1b[0m`, `🌼 ohmycode is running in the background on ${url}.`);
	console.log(`You can close this terminal window.`);
	process.exit(0);
}, 2000);
