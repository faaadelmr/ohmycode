import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import type { RequestHandler } from './$types';
import path from 'path';
import fs from 'fs';
import os from 'os';

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

		// git status --porcelain=v1
		// Column 1: Index status (Staged)
		// Column 2: Working Tree status (Unstaged)
		const statusOutput = execSync(`git -C "${targetPath}" status --porcelain`).toString();
		
		const lines = statusOutput.split('\n').filter(line => line.trim() !== '');
		
		const stagedFiles: any[] = [];
		const unstagedFiles: any[] = [];

		lines.forEach(line => {
			const x = line[0]; // Staged
			const y = line[1]; // Unstaged
			const filePath = line.slice(3).replace(/"/g, '').trim();
			
			// Common helper to parse type
			const getType = (code: string) => {
				if (code === 'A' || code === '?') return 'Added';
				if (code === 'D') return 'Deleted';
				if (code === 'R') return 'Renamed';
				if (code === 'M') return 'Modified';
				return 'Modified';
			};

			// 1. If it has STAGED changes (X is not space or ?)
			if (x !== ' ' && x !== '?') {
				stagedFiles.push({
					file: filePath,
					status: x,
					type: getType(x),
					isStaged: true
				});
			}

			// 2. If it has UNSTAGED changes (Y is not space) or is UNTRACKED (X and Y are ??)
			if (y !== ' ' || (x === '?' && y === '?')) {
				unstagedFiles.push({
					file: filePath,
					status: y === '?' ? '?' : y,
					type: getType(y === ' ' ? x : y), // Fallback to X if Y is space (for new files)
					isStaged: false
				});
			}
		});

		const processSuggestion = (change: any) => {
			let functions: string[] = [];
			let diffData = '';
			let diffStats = { additions: 0, deletions: 0 };
			
			const fullPath = path.resolve(targetPath, change.file);
			
			if (change.type !== 'Deleted') {
				try {
					let diffCmd = change.isStaged 
						? `git -C "${targetPath}" diff --cached -U0 "${change.file}"`
						: `git -C "${targetPath}" diff -U0 "${change.file}"`;

					if (change.status === '??' || (change.isStaged && change.status === 'A')) {
						diffData = 'New file content...';
						if (fs.existsSync(fullPath) && (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.svelte'))) {
							const content = fs.readFileSync(fullPath, 'utf8');
							const functionMatches = content.match(/function\s+(\w+)|const\s+(\w+)\s*=\s*(\(.*?\)|.*?)\s*=>/g);
							if (functionMatches) {
								functions = functionMatches
									.map(m => m.match(/(?:function\s+|const\s+)(\w+)/)?.[1])
									.filter(n => n && !['onMount', 'onDestroy', '$state', '$derived', '$props', '$effect'].includes(n)) as string[];
							}
						}
					} else {
						// For standard diffs
						try {
							diffData = execSync(diffCmd).toString();
							const dLines = diffData.split('\n');
							dLines.forEach(l => {
								if (l.startsWith('+') && !l.startsWith('+++')) diffStats.additions++;
								if (l.startsWith('-') && !l.startsWith('---')) diffStats.deletions++;
							});

							dLines.filter(l => l.startsWith('@@')).forEach(header => {
								const match = header.match(/@@.*@@\s+(?:.*?\s+)?(\w+)/);
								if (match && match[1] && !/^\d+$/.test(match[1])) functions.push(match[1]);
							});

							dLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).forEach(l => {
								const fMatch = l.match(/(?:function\s+|const\s+)(\w+)\s*=?\s*(?:\(|=)/);
								if (fMatch && fMatch[1]) functions.push(fMatch[1]);
							});
						} catch (e) {}
					}
				} catch (e) {}
			}

			return {
				...change,
				functions: [...new Set(functions)].filter(f => f && f.length > 2).slice(0, 8),
				diff: diffData,
				stats: diffStats
			};
		};

		const suggestions = unstagedFiles.map(processSuggestion);
		const stagedChanges = stagedFiles.map(processSuggestion);

		let recentCommits: string[] = [];
		try {
			const logOutput = execSync(`git -C "${targetPath}" log -n 3 --oneline`).toString();
			recentCommits = logOutput.split('\n').filter(l => l.trim() !== '');
		} catch (e) {}

		return json({
			success: true,
			path: targetPath,
			suggestions,
			stagedChanges,
			recentCommits
		});
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, file, stage } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath) || !file) {
			return json({ success: false, error: 'Valid project path and file are required' }, { status: 400 });
		}

		const cmd = stage 
			? `git -C "${projectPath}" add "${file}"`
			: `git -C "${projectPath}" reset HEAD "${file}"`;
		
		try {
			execSync(cmd);
			return json({ success: true });
		} catch (err: any) {
			return json({ 
				success: false, 
				error: `Git command failed`,
				raw: err.stdout?.toString() || err.message
			}, { status: 400 });
		}
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, message, files } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		if (!message || message.trim() === '') {
			return json({ success: false, error: 'Commit message is required' }, { status: 400 });
		}

		if (files && files.length > 0) {
			const stageCmd = `git -C "${projectPath}" add ${files.map((f: string) => `"${f}"`).join(' ')}`;
			execSync(stageCmd);
		} else {
			const status = execSync(`git -C "${projectPath}" status --porcelain`).toString();
			const hasStaged = /^[MADR]/.test(status);
			if (!hasStaged) {
				execSync(`git -C "${projectPath}" add .`);
			}
		}

		const tempMsgFile = path.join(os.tmpdir(), `ohmycode_commit_${Date.now()}.txt`);
		fs.writeFileSync(tempMsgFile, message, 'utf8');
		
		try {
			const commitOutput = execSync(`git -C "${projectPath}" commit --allow-empty --no-verify -F "${tempMsgFile}"`).toString();
			fs.unlinkSync(tempMsgFile);
			return json({ success: true, output: commitOutput });
		} catch (commitErr: any) {
			if (fs.existsSync(tempMsgFile)) fs.unlinkSync(tempMsgFile);
			return json({
				success: false, 
				error: 'Git commit failed.',
				raw: commitErr.stdout?.toString() || commitErr.message
			}, { status: 400 });
		}
	} catch (error) {
		console.error('Git Commit API Error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { projectPath } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		const undoCmd = `git -C "${projectPath}" reset --soft HEAD~1`;
		
		try {
			const output = execSync(undoCmd).toString();
			return json({ success: true, output });
		} catch (err: any) {
			return json({
				success: false,
				error: 'Failed to undo commit.',
				raw: err.stdout?.toString() || err.message
			}, { status: 400 });
		}
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
