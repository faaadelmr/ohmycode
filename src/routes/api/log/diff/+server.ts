import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogsRoot } from '$lib/server/settings';
import fs from 'fs';
import path from 'path';

function resolveSafeChildPath(root: string, relativeFile: string) {
	const fullPath = path.resolve(root, relativeFile);
	const relativePath = path.relative(root, fullPath);

	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
	return fullPath;
}

export const GET: RequestHandler = async ({ url }) => {
	const projectPath = url.searchParams.get('projectPath');
	const relativeFile = url.searchParams.get('file');
	const logFolder = url.searchParams.get('logFolder');
	const createdAt = url.searchParams.get('createdAt');

	if (!projectPath || !relativeFile) {
		return json({ success: false, error: 'Missing required parameters' }, { status: 400 });
	}

	try {
		const logsRoot = getLogsRoot();
		const projectName = path.basename(projectPath);
		const candidates: string[] = [];

		if (logFolder?.trim()) {
			const safeLogFolder = logFolder.replace(/\.\./g, '').replace(/^[/\\]+/, '');
			const diffPath = resolveSafeChildPath(
				path.join(logsRoot, projectName, safeLogFolder, 'diffs'),
				`${relativeFile}.diff`
			);
			if (diffPath) candidates.push(diffPath);
		}

		if (createdAt) {
			const date = new Date(Number(createdAt));
			if (!isNaN(date.getTime())) {
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				const dateFolderName = `${year}${month}${day}`;
				const diffPath = resolveSafeChildPath(
					path.join(logsRoot, projectName, dateFolderName, 'diffs'),
					`${relativeFile}.diff`
				);
				if (diffPath) candidates.push(diffPath);
			}
		}

		for (const candidate of candidates) {
			if (fs.existsSync(candidate)) {
				return json({ success: true, diff: fs.readFileSync(candidate, 'utf8') });
			}
		}

		return json({ success: false, error: 'Saved diff not found' }, { status: 404 });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
