import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogsRoot, getSettings } from '$lib/server/settings';
import fs from 'fs';
import path from 'path';
import { getCurrentBranch, getLatestCommitField, readGitConfigValue } from '$lib/server/git';

/**
 * Derive the next sequential folder name for a given project.
 * Scans existing dirs for a leading number prefix and increments.
 *
 * Examples:
 *   (empty dir)         → "01. My Feature"
 *   ["01. Init"]        → "02. Fix Login"
 *   ["01. A", "03. B"]  → "04. New Thing"   (uses max, not count)
 */
function buildFolderName(projectLogsDir: string, title: string): string {
	let nextNum = 1;

	if (fs.existsSync(projectLogsDir)) {
		const nums = fs
			.readdirSync(projectLogsDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => {
				const m = e.name.match(/^(\d+)\./);
				return m ? parseInt(m[1], 10) : 0;
			})
			.filter((n) => n > 0);

		if (nums.length > 0) {
			nextNum = Math.max(...nums) + 1;
		}
	}

	const paddedNum = String(nextNum).padStart(2, '0');

	// Strip characters that are illegal on Windows/macOS/Linux filesystems
	const safeTitle =
		title
			// eslint-disable-next-line no-control-regex
			.replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 80) || 'untitled';

	return `${paddedNum}. ${safeTitle}`;
}

function resolveSafeChildPath(root: string, relativeFile: string) {
	const fullPath = path.resolve(root, relativeFile);
	const relativePath = path.relative(root, fullPath);

	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
	return fullPath;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { task, projectPath } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		const logsRoot = getLogsRoot();
		const projectName = path.basename(projectPath);
		const projectLogsDir = path.join(logsRoot, projectName);

		// ── Folder name: "01. TITLE" ──────────────────────────────────
		const folderName = buildFolderName(projectLogsDir, task.title);
		const targetDir = path.join(projectLogsDir, folderName);
		const sourceFilesDir = path.join(targetDir, 'files');
		const diffsDir = path.join(targetDir, 'diffs');

		if (!fs.existsSync(sourceFilesDir)) {
			fs.mkdirSync(sourceFilesDir, { recursive: true });
		}

		// ── Always named readme.md ────────────────────────────────────
		const filePath = path.join(targetDir, 'readme.md');

		// Retrieve Git context
		let commitHash = 'N/A';
		let authorName = 'N/A';
		let commitDate = new Date().toISOString().split('T')[0];
		let branchName = 'main';

		if (fs.existsSync(projectPath)) {
			try {
				branchName = getCurrentBranch(projectPath);
			} catch {
				/* default to main */
			}

			try {
				const settings = getSettings();
				authorName =
					settings.gitAuthorName?.trim() || readGitConfigValue(projectPath, 'user.name') || 'N/A';
			} catch {
				/* default to N/A */
			}

			try {
				commitHash = getLatestCommitField(projectPath, '%h');
				const rawDate = getLatestCommitField(projectPath, '%ad', ['--date=short']);
				if (rawDate) {
					commitDate = rawDate;
				}
			} catch {
				/* default to current date */
			}
		}

		const folderMatch = folderName.match(/^(\d+)\.\s*(.*)$/);
		const seqNum = folderMatch ? folderMatch[1] : '01';
		const taskTitle = folderMatch ? folderMatch[2] : task.title;

		const filesLines =
			task.files && task.files.length > 0
				? task.files.map((f: string) => `  - ${f}`).join('\n')
				: '  - None';

		const notesLines =
			task.notes && task.notes.trim()
				? task.notes
						.split('\n')
						.map((line: string) => `  - ${line.trim()}`)
						.join('\n')
				: `  - ${task.description || 'No notes provided.'}`;

		const content = `
# ${seqNum}. ${taskTitle}

## Commit: ${commitHash}
- Author: ${authorName}
- Date: ${commitDate}
- Branch: ${branchName}
- Files Changed:
${filesLines}
- Notes:
${notesLines}
`.trim();

		fs.writeFileSync(filePath, content, 'utf8');

		// ── Copy impacted source files into files/ ────────────────────
		const copiedFiles: string[] = [];
		if (task.files && task.files.length > 0) {
			for (const relativeFile of task.files) {
				const srcPath = path.resolve(projectPath, relativeFile);
				if (fs.existsSync(srcPath)) {
					const destPath = path.join(sourceFilesDir, relativeFile);
					const destSubDir = path.dirname(destPath);
					if (!fs.existsSync(destSubDir)) {
						fs.mkdirSync(destSubDir, { recursive: true });
					}
					try {
						fs.copyFileSync(srcPath, destPath);
						copiedFiles.push(relativeFile);
					} catch (e) {
						console.error(`Failed to copy file ${relativeFile}:`, e);
					}
				}
			}
		}

		const savedDiffs: string[] = [];
		if (task.fileDiffs && typeof task.fileDiffs === 'object') {
			for (const [relativeFile, diff] of Object.entries(task.fileDiffs)) {
				if (typeof diff !== 'string' || !diff) continue;

				const diffPath = resolveSafeChildPath(diffsDir, `${relativeFile}.diff`);
				if (!diffPath) continue;

				const diffSubDir = path.dirname(diffPath);
				if (!fs.existsSync(diffSubDir)) {
					fs.mkdirSync(diffSubDir, { recursive: true });
				}

				fs.writeFileSync(diffPath, diff, 'utf8');
				savedDiffs.push(relativeFile);
			}
		}

		return json({
			success: true,
			folderName,
			filePath,
			centralDir: targetDir,
			copiedCount: copiedFiles.length,
			diffCount: savedDiffs.length
		});
	} catch (error) {
		console.error('Save Log Error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
