import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { task } = await request.json();

		if (!task || !task.id) {
			return json({ success: false, error: 'Task ID is required' }, { status: 400 });
		}

		// Centralized storage directory
		const homeDir = os.homedir();
		const appDataRoot = path.join(homeDir, '.ohmycode');
		const logsRoot = path.join(appDataRoot, 'logs');

		// Reconstruction of the folder structure
		const projectName = task.projectPath ? path.basename(task.projectPath) : 'unknown_project';
		const date = new Date(task.createdAt);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const dateFolderName = `${year}${month}${day}`;
		
		const targetDir = path.join(logsRoot, projectName, dateFolderName);

		if (fs.existsSync(targetDir)) {
			// 1. Find and delete the .md file
			const safeTitle = task.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
			const fileName = `${safeTitle}_${task.id.slice(0, 8)}.md`;
			const filePath = path.join(targetDir, fileName);

			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}

			// 2. Delete the specific files copied for THIS task 
			// (Note: If multiple tasks share the same folder, we should ideally track which files belong to which task, 
			// but for now we delete based on the task description metadata if possible, or just the report)
			// Since our backup maintenance is per project/date, we'll keep it simple: 
			// if it was the ONLY log in that folder, we can delete the whole folder.
			
			const remainingFiles = fs.readdirSync(targetDir).filter(f => f.endsWith('.md'));
			if (remainingFiles.length === 0) {
				// No more reports in this date folder, safe to cleanup everything including 'files' subfolder
				fs.rmSync(targetDir, { recursive: true, force: true });
			}
		}

		return json({ 
			success: true,
			deletedFrom: targetDir
		});
	} catch (error) {
		console.error('Delete Log Error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
