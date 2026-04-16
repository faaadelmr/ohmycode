import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogsRoot } from '$lib/server/settings';
import fs from 'fs';
import path from 'path';

export const GET: RequestHandler = async ({ url }) => {
	const projectPath = url.searchParams.get('projectPath');
	const relativeFile = url.searchParams.get('file');
	const logFolder = url.searchParams.get('logFolder');
	const createdAt = url.searchParams.get('createdAt');

	if (!projectPath || !relativeFile) {
		throw error(400, 'Missing required parameters');
	}

	try {
		const logsRoot = getLogsRoot();
		const projectName = path.basename(projectPath);

		// ── Candidate paths to try, in priority order ─────────────────

		const candidates: string[] = [];

		// 1. New scheme: logFolder param  →  logs/<project>/<NN. Title>/files/<file>
		if (logFolder && logFolder.trim()) {
			// Sanitize: reject path traversal
			const safe = logFolder.replace(/\.\./g, '').replace(/^[/\\]+/, '');
			candidates.push(path.join(logsRoot, projectName, safe, 'files', relativeFile));
		}

		// 2. Legacy scheme: createdAt  →  logs/<project>/<YYYYMMDD>/files/<file>
		if (createdAt) {
			const date = new Date(Number(createdAt));
			if (!isNaN(date.getTime())) {
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				const dateFolderName = `${year}${month}${day}`;
				candidates.push(path.join(logsRoot, projectName, dateFolderName, 'files', relativeFile));
			}
		}

		// 3. Last resort: read directly from the original project path
		candidates.push(path.resolve(projectPath, relativeFile));

		// ── Walk candidates until one exists ──────────────────────────

		for (const filePath of candidates) {
			if (fs.existsSync(filePath)) {
				const fileBuffer = fs.readFileSync(filePath);
				return new Response(fileBuffer, {
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Disposition': `attachment; filename="${path.basename(relativeFile)}"`
					}
				});
			}
		}

		throw error(404, 'File not found in backup or original project');
	} catch (e) {
		if ((e as { status?: number }).status === 404) throw e;
		console.error('Download Error:', e);
		throw error(500, (e as Error).message);
	}
};
