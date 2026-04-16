import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

const resolveSafeFilePath = (projectPath: string, file: string) => {
	const normalizedProjectPath = path.resolve(projectPath);
	const fullPath = path.resolve(normalizedProjectPath, file);
	const relativePath = path.relative(normalizedProjectPath, fullPath);

	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		return null;
	}

	return fullPath;
};

export const GET: RequestHandler = async ({ url }) => {
	const projectPath = url.searchParams.get('path');
	const file = url.searchParams.get('file');

	if (!projectPath || !fs.existsSync(projectPath) || !file) {
		return json({ success: false, error: 'Valid project path and file are required' }, { status: 400 });
	}

	const fullPath = resolveSafeFilePath(projectPath, file);
	if (!fullPath) {
		return json({ success: false, error: 'Invalid file path' }, { status: 400 });
	}

	if (!fs.existsSync(fullPath)) {
		return json({ success: false, error: 'File does not exist' }, { status: 404 });
	}

	try {
		const content = fs.readFileSync(fullPath, 'utf8');
		return json({ success: true, content });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, file, content } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath) || !file || typeof content !== 'string') {
			return json({ success: false, error: 'Valid project path, file, and content are required' }, { status: 400 });
		}

		const fullPath = resolveSafeFilePath(projectPath, file);
		if (!fullPath) {
			return json({ success: false, error: 'Invalid file path' }, { status: 400 });
		}

		if (!fs.existsSync(fullPath)) {
			return json({ success: false, error: 'File does not exist' }, { status: 404 });
		}

		fs.writeFileSync(fullPath, content, 'utf8');
		return json({ success: true });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
