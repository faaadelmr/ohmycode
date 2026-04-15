import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import type { RequestHandler } from './$types';
import path from 'path';
import fs from 'fs';

export const GET: RequestHandler = async ({ url }) => {
	const targetPath = url.searchParams.get('path') || process.cwd();

	// Validate path exists
	if (!fs.existsSync(targetPath)) {
		return json({ success: false, error: 'Directory does not exist' }, { status: 400 });
	}

	try {
		// Check if it's a git repo
		try {
			execSync(`git -C "${targetPath}" rev-parse --is-inside-work-tree`, { stdio: 'ignore' });
		} catch (e) {
			return json({ success: false, error: 'Not a git repository' }, { status: 400 });
		}

		const statusOutput = execSync(`git -C "${targetPath}" status --porcelain`).toString();
		
		const changes = statusOutput.split('\n')
			.filter(line => line.trim() !== '')
			.map(line => {
				const status = line.slice(0, 2);
				const filePath = line.slice(3).replace(/"/g, '').trim();
				
				let type = 'Modified';
				if (status.includes('A') || status.includes('?')) type = 'Added';
				if (status.includes('D')) type = 'Deleted';
				if (status.includes('R')) type = 'Renamed';
				if (status.includes('M')) type = 'Modified';

				return {
					file: filePath,
					status: status.trim(),
					type
				};
			});

		const suggestions = changes.map(change => {
			let functions: string[] = [];
			let diffData = '';
			let diffStats = { additions: 0, deletions: 0 };
			
			const fullPath = path.resolve(targetPath, change.file);
			
			// 1. Get Functions (for TS/JS/Svelte)
			if (fs.existsSync(fullPath) && (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.svelte'))) {
				try {
					const content = fs.readFileSync(fullPath, 'utf8');
					const functionMatches = content.match(/function\s+(\w+)|const\s+(\w+)\s*=\s*(\(.*?\)|.*?)\s*=>/g);
					if (functionMatches) {
						functions = functionMatches
							.map(m => {
								const nameMatch = m.match(/(?:function\s+|const\s+)(\w+)/);
								return nameMatch ? nameMatch[1] : null;
							})
							.filter(name => name && !['onMount', 'onDestroy', '$state', '$derived', '$props', '$effect'].includes(name)) as string[];
					}
				} catch (e) {}
			}

			// 2. Get Actual Diff Details
			if (change.type !== 'Deleted') {
				try {
					// Get unified diff with 0 lines of context for brevity
					// If file is untracked (status ??), we use --no-index or just read file
					let diffCmd = `git -C "${targetPath}" diff -U0 "${change.file}"`;
					if (change.status === '??') {
						// For new untracked files, we can't easily 'diff', so we just show it's new
						diffData = 'New untracked file content...';
					} else {
						diffData = execSync(diffCmd).toString();
						
						// Basic stats parsing from diff
						const lines = diffData.split('\n');
						lines.forEach(line => {
							if (line.startsWith('+') && !line.startsWith('+++')) diffStats.additions++;
							if (line.startsWith('-') && !line.startsWith('---')) diffStats.deletions++;
						});
					}
				} catch (e) {}
			}

			return {
				...change,
				functions: [...new Set(functions)].slice(0, 5),
				diff: diffData,
				stats: diffStats
			};
		});

		let recentCommits: string[] = [];
		try {
			const logOutput = execSync(`git -C "${targetPath}" log -n 3 --oneline`).toString();
			recentCommits = logOutput.split('\n').filter(l => l.trim() !== '');
		} catch (e) {}

		return json({
			success: true,
			path: targetPath,
			suggestions,
			recentCommits
		});
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
