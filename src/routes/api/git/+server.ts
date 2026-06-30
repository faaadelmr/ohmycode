import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
	commit,
	getCurrentBranch,
	getDiff,
	getFullHead,
	getRecentCommitLines,
	getShortHead,
	getStatusPorcelain,
	isInsideWorkTree,
	readGitConfigValue,
	runGit,
	stageAll,
	stageFiles,
	unstageAll,
	unstageFiles
} from '$lib/server/git';
import { getSettings } from '$lib/server/settings';

export const GET: RequestHandler = async ({ url }) => {
	const targetPath = url.searchParams.get('path') || process.cwd();
	const requestedFile = url.searchParams.get('file');
	const requestedStaged = url.searchParams.get('staged') === 'true';
	const includeDiff = url.searchParams.get('diff') === '1' || Boolean(requestedFile);

	if (!fs.existsSync(targetPath)) {
		return json({ success: false, error: 'Directory does not exist' }, { status: 400 });
	}

	try {
		if (!isInsideWorkTree(targetPath)) {
			return json({ success: false, error: 'Not a git repository' }, { status: 400 });
		}

		// git status --porcelain=v1
		// Column 1: Index status (Staged)
		// Column 2: Working Tree status (Unstaged)
		const statusOutput = getStatusPorcelain(targetPath);

		const lines = statusOutput.split('\n').filter((line) => line.trim() !== '');

		const stagedFiles: any[] = [];
		const unstagedFiles: any[] = [];

		lines.forEach((line) => {
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
			if (y !== ' ' || (x === '?' && (y as string) === '?')) {
				unstagedFiles.push({
					file: filePath,
					status: y === '?' ? '?' : y,
					type: getType(y === ' ' ? x : y), // Fallback to X if Y is space (for new files)
					isStaged: false
				});
			}
		});

		const getDirectoryDiff = (
			dirPath: string,
			relativeRoot: string,
			depth = 0
		): { diff: string; additions: number } => {
			let diff = '';
			let additions = 0;

			// Prevent deep recursive scans or heap overflows on huge folders
			if (depth > 4) return { diff, additions };

			try {
				const items = fs.readdirSync(dirPath);
				for (const item of items) {
					// Ignore common massive build artifacts and dependency folders
					if (
						[
							'.git',
							'node_modules',
							'.svelte-kit',
							'dist',
							'build',
							'.vscode',
							'out',
							'target',
							'vendor',
							'.gradle',
							'.idea',
							'bin',
							'obj'
						].includes(item)
					) {
						continue;
					}

					const fullPath = path.join(dirPath, item);
					const relPath = path.join(relativeRoot, item);
					const stat = fs.lstatSync(fullPath);

					if (stat.isDirectory()) {
						const sub = getDirectoryDiff(fullPath, relPath, depth + 1);
						diff += sub.diff;
						additions += sub.additions;
					} else if (stat.isFile()) {
						try {
							// Skip reading huge text files
							if (stat.size > 200 * 1024) continue;

							const content = fs.readFileSync(fullPath, 'utf8');
							const dLines = content.split('\n');
							diff += `\n--- ${relPath} ---\n`;
							diff += dLines.map((l) => `+${l}`).join('\n') + '\n';
							additions += dLines.length;
						} catch (e) {}
					}
				}
			} catch (e) {}
			return { diff, additions };
		};

		const processSuggestion = (change: any) => {
			let functions: string[] = [];
			let diffData = '';
			let diffStats = { additions: 0, deletions: 0 };

			const fullPath = path.resolve(targetPath, change.file);

			if (!includeDiff) {
				return {
					...change,
					functions,
					diff: diffData,
					stats: diffStats
				};
			}

			if (change.type !== 'Deleted') {
				try {
					// 1. Skip generating massive diff strings for huge/ignored files to prevent heavy CPU lags on big projects
					const isHugeFile = (() => {
						try {
							const stats = fs.statSync(fullPath);
							return stats.isFile() && stats.size > 250 * 1024; // > 250KB is considered huge for active diff parsing
						} catch {
							return false;
						}
					})();

					if (isHugeFile) {
						diffData = 'File diff skipped (File too large)';
						return {
							...change,
							functions: [],
							diff: diffData,
							stats: { additions: 0, deletions: 0 }
						};
					}

					if (
						change.status === '?' ||
						change.status === '??' ||
						(change.isStaged && change.status === 'A')
					) {
						if (fs.existsSync(fullPath)) {
							const stat = fs.lstatSync(fullPath);
							if (stat.isDirectory()) {
								const dirDiff = getDirectoryDiff(fullPath, change.file);
								diffData = dirDiff.diff || 'New empty directory';
								diffStats.additions = dirDiff.additions;
							} else {
								const content = fs.readFileSync(fullPath, 'utf8');
								const dLines = content.split('\n');
								// Only include the first 1000 lines of massive new files to avoid bloating client DOMs
								diffData = dLines
									.slice(0, 1000)
									.map((l) => `+${l}`)
									.join('\n');
								if (dLines.length > 1000) {
									diffData += '\n... [Diff truncated to 1000 lines] ...\n';
								}
								diffStats.additions = dLines.length;

								if (
									fullPath.endsWith('.ts') ||
									fullPath.endsWith('.js') ||
									fullPath.endsWith('.svelte')
								) {
									const functionMatches = content.match(
										/function\s+(\w+)|const\s+(\w+)\s*=\s*(\(.*?\)|.*?)\s*=>/g
									);
									if (functionMatches) {
										functions = functionMatches
											.map((m) => m.match(/(?:function\s+|const\s+)(\w+)/)?.[1])
											.filter(
												(n) =>
													n &&
													![
														'onMount',
														'onDestroy',
														'$state',
														'$derived',
														'$props',
														'$effect'
													].includes(n)
											) as string[];
									}
								}
							}
						}
					} else {
						// For standard diffs
						try {
							// Keep diff reads bounded for large repositories.
							diffData = getDiff(targetPath, change.file, Boolean(change.isStaged));
							const dLines = diffData.split('\n');
							dLines.forEach((l) => {
								if (l.startsWith('+') && !l.startsWith('+++')) diffStats.additions++;
								if (l.startsWith('-') && !l.startsWith('---')) diffStats.deletions++;
							});

							dLines
								.filter((l) => l.startsWith('@@'))
								.forEach((header) => {
									const match = header.match(/@@.*@@\s+(?:.*?\s+)?(\w+)/);
									if (match && match[1] && !/^\d+$/.test(match[1])) functions.push(match[1]);
								});

							dLines
								.filter((l) => l.startsWith('+') && !l.startsWith('+++'))
								.forEach((l) => {
									const fMatch = l.match(/(?:function\s+|const\s+)(\w+)\s*=?\s*(?:\(|=)/);
									if (fMatch && fMatch[1]) functions.push(fMatch[1]);
								});
						} catch (e) {}
					}
				} catch (e) {}
			}

			return {
				...change,
				functions: [...new Set(functions)].filter((f) => f && f.length > 2).slice(0, 8),
				diff: diffData,
				stats: diffStats
			};
		};

		if (requestedFile) {
			const sourceList = requestedStaged ? stagedFiles : unstagedFiles;
			const change = sourceList.find((item) => item.file === requestedFile) || {
				file: requestedFile,
				status: requestedStaged ? 'M' : 'M',
				type: 'Modified',
				isStaged: requestedStaged
			};

			return json({
				success: true,
				path: targetPath,
				change: processSuggestion(change)
			});
		}

		const suggestions = unstagedFiles.map(processSuggestion);
		const stagedChanges = stagedFiles.map(processSuggestion);

		let recentCommits: string[] = [];
		try {
			recentCommits = getRecentCommitLines(targetPath, 3);
		} catch (e) {}

		let activeBranch = 'main';
		try {
			activeBranch = getCurrentBranch(targetPath);
		} catch (e) {}

		return json({
			success: true,
			path: targetPath,
			branch: activeBranch,
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
		const { projectPath, file, stage, all } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		try {
			if (all) {
				if (stage) stageAll(projectPath);
				else unstageAll(projectPath);
			} else {
				if (!file) {
					return json({ success: false, error: 'File is required' }, { status: 400 });
				}
				if (stage) stageFiles(projectPath, [file]);
				else unstageFiles(projectPath, [file]);
			}
			return json({ success: true });
		} catch (err: any) {
			return json(
				{
					success: false,
					error: `Git command failed`,
					raw: err.stdout?.toString() || err.message
				},
				{ status: 400 }
			);
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

		try {
			if (files && files.length > 0) {
				stageFiles(projectPath, files);
			} else {
				const status = getStatusPorcelain(projectPath);
				const hasStaged = status
					.split('\n')
					.some((line) => line.length > 0 && line[0] !== ' ' && line[0] !== '?');
				if (!hasStaged) {
					return json(
						{
							success: false,
							error: 'No staged changes to commit. Select files or stage changes first.'
						},
						{ status: 400 }
					);
				}
			}
		} catch (err: any) {
			return json(
				{
					success: false,
					error: 'Git staging failed.',
					raw: err.stdout?.toString() || err.stderr?.toString() || err.message
				},
				{ status: 400 }
			);
		}

		const tempMsgFile = path.join(os.tmpdir(), `ohmycode_commit_${Date.now()}.txt`);
		fs.writeFileSync(tempMsgFile, message, 'utf8');

		const commitFiles = files && files.length > 0 ? files : [];
		const settings = getSettings();
		const authorName =
			settings.gitAuthorName?.trim() || readGitConfigValue(projectPath, 'user.name');
		const authorEmail =
			settings.gitAuthorEmail?.trim() || readGitConfigValue(projectPath, 'user.email');
		const commitEnv = {
			...process.env,
			...(authorName ? { GIT_AUTHOR_NAME: authorName, GIT_COMMITTER_NAME: authorName } : {}),
			...(authorEmail ? { GIT_AUTHOR_EMAIL: authorEmail, GIT_COMMITTER_EMAIL: authorEmail } : {})
		};

		try {
			const commitOutput = commit(projectPath, tempMsgFile, commitFiles, commitEnv);
			const commitHash = getShortHead(projectPath);
			fs.unlinkSync(tempMsgFile);
			return json({ success: true, output: commitOutput, commitHash });
		} catch (commitErr: any) {
			if (fs.existsSync(tempMsgFile)) fs.unlinkSync(tempMsgFile);
			return json(
				{
					success: false,
					error: 'Git commit failed.',
					raw: commitErr.stdout?.toString() || commitErr.message
				},
				{ status: 400 }
			);
		}
	} catch (error) {
		console.error('Git Commit API Error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, commitHash } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		if (commitHash) {
			const headHash = getShortHead(projectPath);
			const fullHeadHash = getFullHead(projectPath);
			if (headHash !== commitHash && fullHeadHash !== commitHash) {
				return json(
					{
						success: false,
						error: 'Cannot undo this log commit because it is no longer the latest commit.'
					},
					{ status: 400 }
				);
			}
		}

		try {
			const output = runGit(projectPath, ['reset', '--soft', 'HEAD~1']);
			return json({ success: true, output });
		} catch (err: any) {
			return json(
				{
					success: false,
					error: 'Failed to undo commit.',
					raw: err.stdout?.toString() || err.message
				},
				{ status: 400 }
			);
		}
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
