import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, file, all } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		if (all) {
			try {
				// Discard all UNSTAGED tracked changes
				execSync(`git -C "${projectPath}" checkout -- .`);
				// Remove all untracked files/dirs
				execSync(`git -C "${projectPath}" clean -fd`);
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
			const statusOutput = execSync(`git -C "${projectPath}" status --porcelain "${file}"`).toString();
			const isUntracked = statusOutput.startsWith('??');

			if (isUntracked) {
				const fullPath = path.resolve(projectPath, file);
				if (fs.existsSync(fullPath)) {
					if (fs.lstatSync(fullPath).isDirectory()) {
						fs.rmSync(fullPath, { recursive: true, force: true });
					} else {
						fs.unlinkSync(fullPath);
					}
				}
			} else {
				// Revert tracked file
				execSync(`git -C "${projectPath}" checkout -- "${file}"`);
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
