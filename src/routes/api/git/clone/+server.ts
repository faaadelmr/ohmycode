import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { runGlobalGit, runGit } from '$lib/server/git';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { sourcePath, targetPath } = await request.json();

		if (!sourcePath || !fs.existsSync(sourcePath)) {
			return json({ success: false, error: 'Source directory does not exist' }, { status: 400 });
		}

		if (!targetPath) {
			return json({ success: false, error: 'Target path is required' }, { status: 400 });
		}

		// Ensure parent directory of targetPath exists
		const targetParent = path.dirname(targetPath);
		if (!fs.existsSync(targetParent)) {
			fs.mkdirSync(targetParent, { recursive: true });
		}

		// If target folder already exists and is not empty, error
		if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
			return json(
				{ success: false, error: 'Target directory already exists and is not empty' },
				{ status: 400 }
			);
		}

		// Check if sourcePath is a git repository
		const isGitRepo = fs.existsSync(path.join(sourcePath, '.git'));
		if (!isGitRepo) {
			try {
				// Initialize it as git repo
				runGit(sourcePath, ['init']);
				// Check if there are any files, if so add and commit
				const files = fs.readdirSync(sourcePath).filter((f) => f !== '.git');
				if (files.length > 0) {
					runGit(sourcePath, ['add', '.']);
					runGit(sourcePath, ['commit', '-m', 'Initial commit from ohmycode auto-init'], {
						env: {
							GIT_AUTHOR_NAME: 'ohmycode',
							GIT_AUTHOR_EMAIL: 'ohmycode@local',
							GIT_COMMITTER_NAME: 'ohmycode',
							GIT_COMMITTER_EMAIL: 'ohmycode@local'
						}
					});
				}
			} catch (err) {
				const e = err as Error;
				return json(
					{
						success: false,
						error: 'Failed to initialize source directory as git repository',
						raw: e.message
					},
					{ status: 500 }
				);
			}
		}

		// Clone the source to target
		try {
			runGlobalGit(['clone', sourcePath, targetPath], { timeout: 30000 });
			return json({ success: true });
		} catch (err) {
			const e = err as Error;
			return json(
				{ success: false, error: 'Failed to clone repository', raw: e.message },
				{ status: 500 }
			);
		}
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
