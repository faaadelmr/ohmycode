import { browser } from '$app/environment';

export interface ExcelSheet {
	id: string;
	title: string;
	headers: string[];
	rows: string[][];
	createdAt: number;
	updatedAt: number;
}

const STORAGE_KEY = 'ohmycode-excel-sheets';

const SAMPLE_QUERY_RESULT = `id\tusername\temail\trole\tstatus\tlogin_count\tlast_active
101\tseb_sepuh\tsebastian@ohmycode.dev\tAdmin\tActive\t1420\t2026-08-10 16:45:00
102\tfadel_dev\tfadel@tumbuhbersama.id\tDeveloper\tActive\t892\t2026-08-10 16:42:12
103\tanya_s\tanya.smith@enterprise.org\tManager\tPending\t45\t2026-08-09 11:20:00
104\trobert_k\trobert.chen@techcorp.io\tDeveloper\tActive\t312\t2026-08-10 14:15:30
105\tsarah_b\tsarah.connor@cyber.net\tAuditor\tInactive\t18\t2026-07-28 09:05:10`;

export function parseQueryTable(rawText: string, hasHeader: boolean = true): { headers: string[]; rows: string[][] } {
	const trimmed = rawText.trim();
	if (!trimmed) return { headers: [], rows: [] };

	// Normalize line endings
	const lines = trimmed.split(/\r?\n/).filter((line) => line.length > 0);
	if (lines.length === 0) return { headers: [], rows: [] };

	// Auto detect delimiter: Tab (\t), Pipe (|), or Comma (,)
	const firstLine = lines[0];
	let delimiter = '\t';
	if (firstLine.includes('\t')) {
		delimiter = '\t';
	} else if (firstLine.includes('|')) {
		// Clean markdown table format if present e.g. | col1 | col2 |
		delimiter = '|';
	} else if (firstLine.includes(',')) {
		delimiter = ',';
	} else if (firstLine.includes(';')) {
		delimiter = ';';
	}

	const parseLine = (line: string): string[] => {
		if (delimiter === '|') {
			return line
				.split('|')
				.map((cell) => cell.trim())
				.filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length <= 2);
		}
		
		if (delimiter === ',') {
			// Basic CSV splitter handling quotes
			const result: string[] = [];
			let current = '';
			let inQuotes = false;
			for (let i = 0; i < line.length; i++) {
				const char = line[i];
				if (char === '"') {
					inQuotes = !inQuotes;
				} else if (char === ',' && !inQuotes) {
					result.push(current.trim().replace(/^"|"$/g, ''));
					current = '';
				} else {
					current += char;
				}
			}
			result.push(current.trim().replace(/^"|"$/g, ''));
			return result;
		}

		return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''));
	};

	// Ignore markdown separator line like |---|---|
	const validLines = lines.filter((l) => !/^\|?\s*[-:]+\s*(\|s*[-:]+\s*)+\|?$/.test(l));

	if (validLines.length === 0) return { headers: [], rows: [] };

	let headers: string[] = [];
	let dataLines = validLines;

	if (hasHeader) {
		headers = parseLine(validLines[0]);
		dataLines = validLines.slice(1);
	}

	const rows = dataLines.map((line) => parseLine(line));

	// Normalize row length to match max column count
	const maxCols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
	
	if (headers.length === 0) {
		headers = Array.from({ length: maxCols }, (_, i) => getColumnName(i));
	} else {
		while (headers.length < maxCols) {
			headers.push(getColumnName(headers.length));
		}
	}

	const normalizedRows = rows.map((r) => {
		const newRow = [...r];
		while (newRow.length < maxCols) {
			newRow.push('');
		}
		return newRow;
	});

	return { headers, rows: normalizedRows };
}

export function getColumnName(colIndex: number): string {
	let name = '';
	let num = colIndex;
	while (num >= 0) {
		name = String.fromCharCode((num % 26) + 65) + name;
		num = Math.floor(num / 26) - 1;
	}
	return name;
}

export function getInitialSheets(): ExcelSheet[] {
	if (!browser) return [createSampleSheet()];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed) && parsed.length > 0) {
				return parsed;
			}
		}
	} catch (e) {
		console.error('Failed to load excel sheets', e);
	}
	const sample = createSampleSheet();
	saveSheetsToStorage([sample]);
	return [sample];
}

export function createSampleSheet(): ExcelSheet {
	const parsed = parseQueryTable(SAMPLE_QUERY_RESULT, true);
	return {
		id: 'sample-query-result',
		title: 'Query Result (Users)',
		headers: parsed.headers,
		rows: parsed.rows,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
}

export function saveSheetsToStorage(sheets: ExcelSheet[]): void {
	if (browser) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
		} catch (e) {
			console.error('Failed to save excel sheets', e);
		}
	}
}
