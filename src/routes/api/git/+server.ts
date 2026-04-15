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

		// Get changed files (porcelain is easier to parse)
		// XY PATH
		// X: status in index, Y: status in work tree
		const statusOutput = execSync(`git -C "${targetPath}" status --porcelain`).toString();
		
		const changes = statusOutput.split('\n')
			.filter(line => line.trim() !== '')
			.map(line => {
				const status = line.slice(0, 2);
				const filePath = line.slice(3).replace(/"/g, ''); // Remove quotes if any
				
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

		// For each changed file, try to get more details (like functions)
		const suggestions = changes.map(change => {
			let functions: string[] = [];
			const fullPath = path.resolve(targetPath, change.file);
			
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
				} catch (e) {
					// Skip details if file can't be read
				}
			}

			return {
				...change,
				functions: [...new Set(functions)].slice(0, 5)
			};
		});

		// Also get last 3 commit messages for "detail" context
		let recentCommits: string[] = [];
		try {
			const logOutput = execSync(`git -C "${targetPath}" log -n 3 --oneline`).toString();
			recentCommits = logOutput.split('\n').filter(l => l.trim() !== '');
		} catch (e) {
			// Ignore if no commits
		}

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
