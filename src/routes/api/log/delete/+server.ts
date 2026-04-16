import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogsRoot } from '$lib/server/settings';
import fs from 'fs';
import path from 'path';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { task } = await request.json();

		if (!task || !task.id) {
			return json({ success: false, error: 'Task ID is required' }, { status: 400 });
		}

		const logsRoot = getLogsRoot();
		const projectName = task.projectPath ? path.basename(task.projectPath) : 'unknown_project';
		const projectLogsDir = path.join(logsRoot, projectName);

		let targetDir: string | null = null;

		// ── Primary: use stored logFolderName (new tasks) ──────────────
		if (task.logFolderName) {
			const candidate = path.join(projectLogsDir, task.logFolderName);
			if (fs.existsSync(candidate)) {
				targetDir = candidate;
			}
		}

		// ── Fallback: old date-based folder (legacy tasks) ─────────────
		if (!targetDir && task.createdAt) {
			const date = new Date(task.createdAt);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			const dateFolderName = `${year}${month}${day}`;
			const candidate = path.join(projectLogsDir, dateFolderName);

			if (fs.existsSync(candidate)) {
				// In the old scheme multiple tasks could share a date folder,
				// so only delete the specific .md file; remove folder if empty.
				const safeTitle = (task.title as string).replace(/[^a-z0-9]/gi, '_').toLowerCase();
				const fileName = `${safeTitle}_${(task.id as string).slice(0, 8)}.md`;
				const filePath = path.join(candidate, fileName);

				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}

				const remainingMd = fs.readdirSync(candidate).filter((f) => f.endsWith('.md'));
				if (remainingMd.length === 0) {
					fs.rmSync(candidate, { recursive: true, force: true });
				}

				return json({ success: true, deletedFrom: candidate });
			}
		}

		// ── Delete the entire task folder (new scheme, 1 folder = 1 task)
		if (targetDir) {
			fs.rmSync(targetDir, { recursive: true, force: true });
		}

		return json({ success: true, deletedFrom: targetDir ?? null });
	} catch (error) {
		console.error('Delete Log Error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
