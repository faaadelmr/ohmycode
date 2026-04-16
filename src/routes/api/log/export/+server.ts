import type { RequestHandler } from './$types';
import { getLogsRoot, getSettings } from '$lib/server/settings';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { json } from '@sveltejs/kit';

function addDirToZip(zip: AdmZip, dir: string, zipPath: string) {
	if (!fs.existsSync(dir)) return;
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		const entryZipPath = `${zipPath}/${entry.name}`;
		if (entry.isDirectory()) {
			addDirToZip(zip, fullPath, entryZipPath);
		} else if (entry.isFile()) {
			const buffer = fs.readFileSync(fullPath);
			zip.addFile(entryZipPath, buffer);
		}
	}
}

function countFiles(dir: string): { logs: number; files: number } {
	let logs = 0;
	let files = 0;
	if (!fs.existsSync(dir)) return { logs, files };

	function walk(d: string) {
		const entries = fs.readdirSync(d, { withFileTypes: true });
		for (const e of entries) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) {
				walk(full);
			} else if (e.isFile()) {
				if (e.name.endsWith('.md')) logs++;
				else files++;
			}
		}
	}
	walk(dir);
	return { logs, files };
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { tasks } = await request.json();
		const logsRoot = getLogsRoot();
		const settings = getSettings();

		const zip = new AdmZip();

		// ── 1. manifest.json ──────────────────────────────────────────
		const manifest = {
			version: '1.0',
			exportedAt: new Date().toISOString(),
			settings: { logStoragePath: settings.logStoragePath ?? null },
			tasks: tasks ?? []
		};
		zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

		// ── 2. logs/ directory ────────────────────────────────────────
		addDirToZip(zip, logsRoot, 'logs');

		// ── 3. build stats for response headers ───────────────────────
		const { logs, files } = countFiles(logsRoot);
		const stats = { tasks: (tasks ?? []).length, logs, files };

		const zipBuffer = zip.toBuffer();

		return new Response(zipBuffer, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="ohmycode-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
				'Content-Length': String(zipBuffer.length),
				'X-Ohmycode-Stats': JSON.stringify(stats)
			}
		});
	} catch (error) {
		console.error('Export error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
