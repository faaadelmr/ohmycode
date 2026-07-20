import fs from 'fs';
import path from 'path';
import os from 'os';

const SNIPPETS_PATH = path.join(os.homedir(), '.ohmycode', 'snippets.json');

export interface Snippet {
	id: string;
	title: string;
	content: string;
	language: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
}

export function getSnippets(): Snippet[] {
	try {
		if (fs.existsSync(SNIPPETS_PATH)) {
			return JSON.parse(fs.readFileSync(SNIPPETS_PATH, 'utf8'));
		}
	} catch {
		/* return empty list if missing or corrupt */
	}
	return [];
}

export function saveSnippets(snippets: Snippet[]): void {
	const dir = path.dirname(SNIPPETS_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(SNIPPETS_PATH, JSON.stringify(snippets, null, 2), 'utf8');
}
