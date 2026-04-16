import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.ohmycode', 'config.json');

export interface AppSettings {
	logStoragePath?: string;
}

export function getSettings(): AppSettings {
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
		}
	} catch {}
	return {};
}

export function saveSettings(settings: AppSettings): void {
	const dir = path.dirname(CONFIG_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

export function getLogsRoot(): string {
	const settings = getSettings();
	if (settings.logStoragePath?.trim()) return settings.logStoragePath.trim();
	return path.join(os.homedir(), '.ohmycode', 'logs');
}

export function getDefaultLogsRoot(): string {
	return path.join(os.homedir(), '.ohmycode', 'logs');
}
