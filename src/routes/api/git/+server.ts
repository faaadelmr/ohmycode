import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import type { RequestHandler } from './$types';
import path from 'path';
import fs from 'fs';

export const GET: RequestHandler = async ({ url }) => {
	const targetPath = url.searchParams.get('path') || process.cwd();

	if (!fs.existsSync(targetPath)) {
		return json({ success: false, error: 'Directory does not exist' }, { status: 400 });
	}

	try {
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
			
			if (change.type !== 'Deleted') {
				try {
					// 1. Get Actual Diff Details
					let diffCmd = `git -C "${targetPath}" diff -U0 "${change.file}"`;
					if (change.status === '??') {
						diffData = 'New untracked file content...';
						
						// For new files, extract all functions since everything is "changed"
						if (fs.existsSync(fullPath) && (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.svelte'))) {
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
						}
					} else {
						diffData = execSync(diffCmd).toString();
						
						const lines = diffData.split('\n');
						lines.forEach(line => {
							if (line.startsWith('+') && !line.startsWith('+++')) diffStats.additions++;
							if (line.startsWith('-') && !line.startsWith('---')) diffStats.deletions++;
						});

						// 2. Extract ONLY changed functions from diff hunk headers
						// Git diff -U0 hunk headers usually look like: @@ -line,count +line,count @@ functionName()
						const hunkHeaders = lines.filter(l => l.startsWith('@@'));
						hunkHeaders.forEach(header => {
							// Match common patterns in the hunk header (where git tries to show the function context)
							const contextMatch = header.match(/@@.*@@\s+(?:.*?\s+)?(\w+)/);
							if (contextMatch && contextMatch[1] && !/^\d+$/.test(contextMatch[1])) {
								functions.push(contextMatch[1]);
							}
						});

						// Also scan the added lines (+) for new function definitions
						const addedLines = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));
						addedLines.forEach(line => {
							const funcMatch = line.match(/(?:function\s+|const\s+)(\w+)\s*=?\s*(?:\(|=)/);
							if (funcMatch && funcMatch[1]) {
								functions.push(funcMatch[1]);
							}
						});
					}
				} catch (e) {}
			}

			return {
				...change,
				functions: [...new Set(functions)].filter(f => f.length > 2).slice(0, 8),
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
