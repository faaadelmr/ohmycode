import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

export const GET: RequestHandler = ({ url }) => {
	let projectPath = url.searchParams.get('path');

	if (!projectPath || !fs.existsSync(projectPath)) {
		return new Response('Path required', { status: 400 });
	}

	// Ensure absolute path for watcher
	projectPath = path.resolve(projectPath);

	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			let watcher: fs.FSWatcher | null = null;
			let debounceTimer: NodeJS.Timeout;
			const encoder = new TextEncoder();

			const emit = (event: string, data: string) => {
				if (closed) return;
				try {
					// Standard SSE format
					const chunk = `event: ${event}\ndata: ${data}\n\n`;
					controller.enqueue(encoder.encode(chunk));
				} catch (e) {
					closed = true;
				}
			};

			// Send immediate retry hint
			emit('retry', '1000');

			try {
				console.log(`[Watcher] Starting for: ${projectPath}`);
				watcher = fs.watch(projectPath, { recursive: true }, (event, filename) => {
					if (closed) return;
					
					// Filter out noise, but ALLOW .git/index to detect staging changes
					const isSvelteKit = filename.includes('.svelte-kit');
					const isNodeModules = filename.includes('node_modules');
					const isOhMyCode = filename.includes('.ohmycode');
					const isGitOther = filename.includes('.git') && !filename.endsWith('index') && !filename.endsWith('HEAD');

					if (!filename || isSvelteKit || isNodeModules || isOhMyCode || isGitOther) return;

					console.log(`[Watcher] Change detected: ${filename} (${event})`);

					clearTimeout(debounceTimer);
					debounceTimer = setTimeout(() => {
						emit('change', JSON.stringify({ event, filename, time: Date.now() }));
					}, 3000); // 300ms debounce
				});
			} catch (e) {
				console.error('[Watcher] Error:', e);
				emit('error', (e as Error).message);
			}

			const pingInterval = setInterval(() => {
				emit('ping', 'keep-alive');
			}, 15000); // More frequent ping (15s)

			return () => {
				closed = true;
				if (watcher) watcher.close();
				clearInterval(pingInterval);
				clearTimeout(debounceTimer);
				console.log(`[Watcher] Stopped for: ${projectPath}`);
			};
		},
		cancel() {
			closed = true;
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable buffering for Nginx/Proxies
		}
	});
};
