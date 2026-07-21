import fs from 'fs';
import path from 'path';
import os from 'os';

const COMPARISONS_PATH = path.join(os.homedir(), '.ohmycode', 'comparisons.json');

export interface Comparison {
	id: string;
	title: string;
	beforeCode: string;
	afterCode: string;
	viewMode: 'edit' | 'diff';
	layout: 'split' | 'inline';
	createdAt: number;
	updatedAt: number;
}

export function getComparisons(): Comparison[] {
	try {
		if (fs.existsSync(COMPARISONS_PATH)) {
			return JSON.parse(fs.readFileSync(COMPARISONS_PATH, 'utf8'));
		}
	} catch {
		/* return empty list if missing or corrupt */
	}
	return [];
}

export function saveComparisons(comparisons: Comparison[]): void {
	const dir = path.dirname(COMPARISONS_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(COMPARISONS_PATH, JSON.stringify(comparisons, null, 2), 'utf8');
}
