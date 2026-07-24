#! /usr/bin/env node

import { spawn, exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import SysTrayModule from 'systray2';

const SysTray = SysTrayModule.default || SysTrayModule;

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

// Wait a bit for server to start, then open browser and setup system tray
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
	console.log(`System Tray is active. You can close this terminal window.`);

	const iconPath = path.resolve(
		__dirname,
		os.platform() === 'win32' ? 'ohmycode_logo.ico' : 'ohmycode_logo.png'
	);

	const iconBase64 = fs.existsSync(iconPath)
		? fs.readFileSync(iconPath).toString('base64')
		: '';

	const itemHeader = {
		title: `ohmycode (Port ${port})`,
		tooltip: 'ohmycode Server Status',
		checked: false,
		enabled: false
	};

	const itemOpen = {
		title: 'Open Dashboard',
		tooltip: 'Open ohmycode in browser',
		checked: false,
		enabled: true,
		click: () => {
			try {
				exec(`${start} ${url}`);
			} catch {
				// Ignore browser open errors
			}
		}
	};

	const itemExit = {
		title: 'Quit',
		tooltip: 'Shut down ohmycode server',
		checked: false,
		enabled: true,
		click: () => {
			try {
				server.kill();
			} catch {
				// Ignore server kill errors
			}
			systray.kill(false);
			process.exit(0);
		}
	};

	const systray = new SysTray({
		menu: {
			icon: iconBase64,
			isTemplateIcon: os.platform() === 'darwin',
			title: 'ohmycode',
			tooltip: `ohmycode (Port ${port})`,
			items: [itemHeader, SysTray.separator, itemOpen, SysTray.separator, itemExit]
		},
		debug: false,
		copyDir: true
	});

	systray.onClick((action) => {
		if (action.item && action.item.title === 'Open Dashboard') {
			itemOpen.click();
		} else if (action.item && (action.item.title === 'Quit' || action.item.title === 'Exit')) {
			itemExit.click();
		}
	});

	systray
		.ready()
		.then(() => {
			console.log(`System Tray loaded successfully.`);
		})
		.catch((err) => {
			console.error('Failed to load system tray:', err.message);
		});
}, 2000);
