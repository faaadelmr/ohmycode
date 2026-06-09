import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { getStatusPorcelain, runGit } from '$lib/server/git';

const resolveSafeFilePath = (projectPath: string, file: string) => {
	const root = path.resolve(projectPath);
	const fullPath = path.resolve(root, file);
	const relativePath = path.relative(root, fullPath);

	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
	return fullPath;
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, file, all } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		if (all) {
			try {
				// Discard all UNSTAGED tracked changes
				runGit(projectPath, ['checkout', '--', '.']);
				// Remove all untracked files/dirs
				runGit(projectPath, ['clean', '-fd']);
				return json({ success: true });
			} catch (err: any) {
				return json({ 
					success: false, 
					error: 'Bulk discard failed', 
					raw: err.stdout?.toString() || err.message 
				}, { status: 400 });
			}
		}

		if (!file) {
			return json({ success: false, error: 'File is required' }, { status: 400 });
		}

		try {
			// Check status to see if it's untracked
			const statusOutput = getStatusPorcelain(projectPath, file);
			const isUntracked = statusOutput.startsWith('??');
			const fullPath = resolveSafeFilePath(projectPath, file);
			if (!fullPath) {
				return json({ success: false, error: 'Invalid file path' }, { status: 400 });
			}

			if (isUntracked) {
				if (fs.existsSync(fullPath)) {
					if (fs.lstatSync(fullPath).isDirectory()) {
						fs.rmSync(fullPath, { recursive: true, force: true });
					} else {
						fs.unlinkSync(fullPath);
					}
				}
			} else {
				// Revert tracked file
				runGit(projectPath, ['checkout', '--', file]);
			}

			return json({ success: true });
		} catch (err: any) {
			return json({ 
				success: false, 
				error: `Discard failed for ${file}`, 
				raw: err.stdout?.toString() || err.message 
			}, { status: 400 });
		}
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
