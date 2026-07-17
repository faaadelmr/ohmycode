import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import { runGit } from '$lib/server/git';

export const GET: RequestHandler = async ({ url }) => {
	const projectPath = url.searchParams.get('path');
	const commitHash = url.searchParams.get('commit');
	const file = url.searchParams.get('file');

	if (!projectPath || !fs.existsSync(projectPath)) {
		return json({ success: false, error: 'Directory does not exist' }, { status: 400 });
	}

	try {
		// 1. If 'commit' and 'file' are provided, fetch the actual file diff at that commit hash
		if (commitHash && file) {
			try {
				const diffOutput = runGit(projectPath, ['show', commitHash, '--', file], {
					timeout: 1000,
					maxBuffer: 1024 * 1024
				});
				return json({ success: true, diff: diffOutput });
			} catch {
				return json({ success: false, error: 'Failed to fetch commit file diff' }, { status: 500 });
			}
		}

		// 2. If 'commit' is provided, fetch the changed files list and their types/stats
		if (commitHash) {
			try {
				// git show --name-status --oneline <hash>
				const showOutput = runGit(
					projectPath,
					['show', '--name-status', '--pretty=format:', commitHash],
					{ timeout: 1000 }
				);

				const lines = showOutput.split('\n').filter((l) => l.trim() !== '');
				const changedFiles = lines.map((line) => {
					const parts = line.split('\t');
					const status = parts[0]; // M, A, D, R etc.
					const filePath = parts[1];

					const getType = (code: string) => {
						if (code.startsWith('A')) return 'Added';
						if (code.startsWith('D')) return 'Deleted';
						if (code.startsWith('R')) return 'Renamed';
						return 'Modified';
					};

					return {
						file: filePath,
						type: getType(status),
						status: status,
						isStaged: false
					};
				});

				return json({ success: true, files: changedFiles });
			} catch {
				return json(
					{ success: false, error: 'Failed to fetch commit changed files' },
					{ status: 500 }
				);
			}
		}

		// 3. Otherwise, return the latest 15 commits from the repository
		const logOutput = runGit(
			projectPath,
			['log', '-n', '15', '--pretty=format:%h|%an|%ad|%s|%d', '--date=short'],
			{ timeout: 1500 }
		);

		const lines = logOutput.split('\n').filter((l) => l.trim() !== '');
		const commits = lines.map((line) => {
			const [hash, author, date, subject, refs] = line.split('|');

			// Format branch/reference tags nicely (e.g. removes surrounding parentheses)
			const formattedRefs = refs ? refs.trim().replace(/^\((.*)\)$/, '$1') : '';

			return {
				id: hash,
				title: subject,
				author,
				date,
				refs: formattedRefs,
				files: [], // populated on-demand when clicked
				createdAt: new Date(date).getTime() || Date.now()
			};
		});

		return json({ success: true, commits });
	} catch (e) {
		return json({ success: false, error: (e as Error).message }, { status: 500 });
	}
};
