import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const GET: RequestHandler = async ({ url }) => {
	const projectPath = url.searchParams.get('projectPath');
	const createdAt = url.searchParams.get('createdAt');
	const relativeFile = url.searchParams.get('file');

	if (!projectPath || !createdAt || !relativeFile) {
		throw error(400, 'Missing required parameters');
	}

	try {
		const homeDir = os.homedir();
		const appDataRoot = path.join(homeDir, '.ohmycode');
		const logsRoot = path.join(appDataRoot, 'logs');

		const projectName = path.basename(projectPath);
		
		const date = new Date(Number(createdAt));
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const dateFolderName = `${year}${month}${day}`;
		
		// Path to the backed up file
		const filePath = path.join(logsRoot, projectName, dateFolderName, 'files', relativeFile);

		if (!fs.existsSync(filePath)) {
			// Fallback: Try to read from original project path if backup doesn't exist
			const originalPath = path.resolve(projectPath, relativeFile);
			if (fs.existsSync(originalPath)) {
				const fileBuffer = fs.readFileSync(originalPath);
				return new Response(fileBuffer, {
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Disposition': `attachment; filename="${path.basename(relativeFile)}"`
					}
				});
			}
			throw error(404, 'File not found');
		}

		const fileBuffer = fs.readFileSync(filePath);
		const fileName = path.basename(relativeFile);

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${fileName}"`
			}
		});
	} catch (e) {
		console.error('Download Error:', e);
		throw error(500, (e as Error).message);
	}
};
