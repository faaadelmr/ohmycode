import type { RequestHandler } from './$types';
import { getLogsRoot } from '$lib/server/settings';
import { json } from '@sveltejs/kit';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const contentType = request.headers.get('content-type') ?? '';

		let zipBuffer: Buffer;

		if (contentType.includes('multipart/form-data')) {
			// ── Receive as FormData (from file input) ──────────────────
			const formData = await request.formData();
			const file = formData.get('file');

			if (!file || typeof file === 'string') {
				return json({ success: false, error: 'No file uploaded' }, { status: 400 });
			}

			const arrayBuffer = await (file as File).arrayBuffer();
			zipBuffer = Buffer.from(arrayBuffer);
		} else {
			// ── Receive as raw binary body ─────────────────────────────
			const arrayBuffer = await request.arrayBuffer();
			zipBuffer = Buffer.from(arrayBuffer);
		}

		// ── Open ZIP ───────────────────────────────────────────────────
		let zip: AdmZip;
		try {
			zip = new AdmZip(zipBuffer);
		} catch {
			return json({ success: false, error: 'Invalid or corrupted ZIP file' }, { status: 400 });
		}

		// ── Read manifest.json ─────────────────────────────────────────
		const manifestEntry = zip.getEntry('manifest.json');
		if (!manifestEntry) {
			return json(
				{ success: false, error: 'Invalid backup: manifest.json not found inside ZIP' },
				{ status: 400 }
			);
		}

		let manifest: { version: string; tasks: unknown[]; exportedAt?: string };
		try {
			manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
		} catch {
			return json(
				{ success: false, error: 'Invalid manifest.json: could not parse JSON' },
				{ status: 400 }
			);
		}

		if (!manifest.version || !Array.isArray(manifest.tasks)) {
			return json(
				{ success: false, error: 'Invalid manifest.json: missing version or tasks fields' },
				{ status: 400 }
			);
		}

		// ── Restore logs/ tree to configured storage root ──────────────
		const logsRoot = getLogsRoot();
		const entries = zip.getEntries();
		let restoredFiles = 0;

		for (const entry of entries) {
			// Skip manifest and directory entries
			if (entry.entryName === 'manifest.json' || entry.isDirectory) continue;

			// Only restore entries under logs/
			if (!entry.entryName.startsWith('logs/')) continue;

			// Strip the leading "logs/" prefix to get the relative storage path
			const relativePath = entry.entryName.slice('logs/'.length);

			// Sanitize: reject any path-traversal attempts
			if (relativePath.includes('..') || path.isAbsolute(relativePath)) continue;

			const destPath = path.join(logsRoot, relativePath);

			// Ensure destination directory exists
			fs.mkdirSync(path.dirname(destPath), { recursive: true });

			// Write the file (getData() returns a Buffer, safe for both text and binary)
			fs.writeFileSync(destPath, entry.getData());
			restoredFiles++;
		}

		return json({
			success: true,
			tasks: manifest.tasks,
			stats: {
				tasks: manifest.tasks.length,
				files: restoredFiles
			}
		});
	} catch (error) {
		console.error('Import error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
