<!-- eslint-disable svelte/no-at-html-tags -->
<script lang="ts">
	import { getColumnName, parseQueryTable, type ExcelSheet } from '$lib/excelStore';

	let {
		sheet = $bindable<ExcelSheet>({
			id: 'default-sheet',
			title: 'Query Result Sheet',
			headers: ['id', 'name', 'email', 'status'],
			rows: [
				['1', 'Sebastian', 'seb@ohmycode.dev', 'Active'],
				['2', 'Fadel', 'fadel@tumbuhbersama.id', 'Active']
			],
			createdAt: Date.now(),
			updatedAt: Date.now()
		}),
		onSave
	}: {
		sheet?: ExcelSheet;
		onSave?: (updatedSheet: ExcelSheet) => void;
	} = $props();

	// Interactive Grid State
	let selectedCell = $state<{ r: number; c: number } | null>({ r: 0, c: 0 });
	let editingCell = $state<{ r: number; c: number } | null>(null);
	let cellInputValue = $state('');
	let filterQuery = $state('');
	let hasHeaderInput = $state(true);

	// Paste Modal State
	let showPasteModal = $state(false);
	let pasteRawText = $state('');

	// Toast Notification
	let toastMessage = $state('');

	function showToast(msg: string) {
		toastMessage = msg;
		setTimeout(() => {
			if (toastMessage === msg) toastMessage = '';
		}, 3000);
	}

	// State for text wrapping & grid options
	let isWrapTextEnabled = $state(true);

	function focusElement(node: HTMLElement) {
		node.focus();
	}

	let selectedCellAddress = $derived.by(() => {
		if (!selectedCell) return 'A1';
		const colLetter = getColumnName(selectedCell.c);
		const headerName = sheet.headers[selectedCell.c] || colLetter;
		return `${colLetter}${selectedCell.r + 1} (${headerName})`;
	});

	let filteredRowsWithIndex = $derived.by(() => {
		if (!filterQuery.trim()) {
			return sheet.rows.map((row, idx) => ({ row, originalIndex: idx }));
		}
		const q = filterQuery.toLowerCase();
		return sheet.rows
			.map((row, idx) => ({ row, originalIndex: idx }))
			.filter(({ row }) => row.some((cell) => cell.toLowerCase().includes(q)));
	});

	// Quick Statistics for numbers in table
	let tableStats = $derived.by(() => {
		let totalCells = 0;
		let numericCount = 0;
		let sum = 0;
		let min = Infinity;
		let max = -Infinity;

		sheet.rows.forEach((row) => {
			row.forEach((cell) => {
				totalCells++;
				const val = parseFloat(cell.replace(/,/g, ''));
				if (!isNaN(val) && cell.trim() !== '') {
					numericCount++;
					sum += val;
					if (val < min) min = val;
					if (val > max) max = val;
				}
			});
		});

		const avg = numericCount > 0 ? sum / numericCount : 0;
		return {
			rowCount: sheet.rows.length,
			colCount: sheet.headers.length,
			totalCells,
			numericCount,
			sum,
			avg,
			min: min === Infinity ? 0 : min,
			max: max === -Infinity ? 0 : max
		};
	});

	function updateSheet(updated: Partial<ExcelSheet>) {
		sheet = {
			...sheet,
			...updated,
			updatedAt: Date.now()
		};
		if (onSave) onSave(sheet);
	}

	// Cell Focus & Edit Handlers
	function selectCell(r: number, c: number) {
		selectedCell = { r, c };
		cellInputValue = sheet.rows[r]?.[c] ?? '';
	}

	function startEditing(r: number, c: number) {
		selectedCell = { r, c };
		editingCell = { r, c };
		cellInputValue = sheet.rows[r]?.[c] ?? '';
	}

	function commitCellEdit() {
		if (!editingCell) return;
		const { r, c } = editingCell;
		const newRows = sheet.rows.map((row, ri) =>
			ri === r ? row.map((cell, ci) => (ci === c ? cellInputValue : cell)) : row
		);
		updateSheet({ rows: newRows });
		editingCell = null;
	}

	function cancelCellEdit() {
		editingCell = null;
		if (selectedCell) {
			cellInputValue = sheet.rows[selectedCell.r]?.[selectedCell.c] ?? '';
		}
	}

	function handleFormulaBarChange(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		cellInputValue = val;
		if (selectedCell) {
			const { r, c } = selectedCell;
			const newRows = sheet.rows.map((row, ri) =>
				ri === r ? row.map((cell, ci) => (ci === c ? val : cell)) : row
			);
			updateSheet({ rows: newRows });
		}
	}

	// Keyboard Navigation inside Grid
	function handleKeyDown(e: KeyboardEvent) {
		if (editingCell) {
			if (e.key === 'Enter') {
				e.preventDefault();
				commitCellEdit();
				// Move focus down after Enter
				if (selectedCell && selectedCell.r < sheet.rows.length - 1) {
					selectCell(selectedCell.r + 1, selectedCell.c);
				}
			} else if (e.key === 'Escape') {
				cancelCellEdit();
			}
			return;
		}

		if (!selectedCell) return;
		const { r, c } = selectedCell;

		if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (r > 0) selectCell(r - 1, c);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (r < sheet.rows.length - 1) selectCell(r + 1, c);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			if (c > 0) selectCell(r, c - 1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			if (c < sheet.headers.length - 1) selectCell(r, c + 1);
		} else if (e.key === 'Tab') {
			e.preventDefault();
			if (e.shiftKey) {
				if (c > 0) selectCell(r, c - 1);
				else if (r > 0) selectCell(r - 1, sheet.headers.length - 1);
			} else {
				if (c < sheet.headers.length - 1) selectCell(r, c + 1);
				else if (r < sheet.rows.length - 1) selectCell(r + 1, 0);
			}
		} else if (e.key === 'Enter' || e.key === 'F2') {
			e.preventDefault();
			startEditing(r, c);
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			const newRows = sheet.rows.map((row, ri) =>
				ri === r ? row.map((cell, ci) => (ci === c ? '' : cell)) : row
			);
			updateSheet({ rows: newRows });
			cellInputValue = '';
		}
	}

	// Paste Query Processing
	function handlePasteData(rawText: string) {
		const parsed = parseQueryTable(rawText, hasHeaderInput);
		if (parsed.headers.length === 0 && parsed.rows.length === 0) {
			showToast('No query data found in text!');
			return;
		}
		updateSheet({
			headers: parsed.headers,
			rows: parsed.rows
		});
		selectedCell = { r: 0, c: 0 };
		cellInputValue = parsed.rows[0]?.[0] ?? '';
		showToast(`Successfully loaded ${parsed.rows.length} rows & ${parsed.headers.length} columns!`);
		showPasteModal = false;
		pasteRawText = '';
	}

	async function pasteFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			if (text && text.trim()) {
				handlePasteData(text);
			} else {
				showToast('Clipboard is empty!');
			}
		} catch (e) {
			console.warn('Clipboard read failed, opening modal fallback', e);
			showPasteModal = true;
		}
	}

	// Row & Column Operations
	function addRow() {
		const newRow = Array(sheet.headers.length).fill('');
		const newRows = [...sheet.rows, newRow];
		updateSheet({ rows: newRows });
		selectCell(newRows.length - 1, selectedCell?.c ?? 0);
	}

	function addColumn() {
		const newColIndex = sheet.headers.length;
		const newHeaders = [...sheet.headers, `col_${newColIndex + 1}`];
		const newRows = sheet.rows.map((r) => [...r, '']);
		updateSheet({ headers: newHeaders, rows: newRows });
		if (selectedCell) selectCell(selectedCell.r, newColIndex);
	}

	function deleteSelectedRow() {
		if (!selectedCell || sheet.rows.length <= 1) return;
		const targetR = selectedCell.r;
		const newRows = sheet.rows.filter((_, idx) => idx !== targetR);
		updateSheet({ rows: newRows });
		const nextR = Math.min(targetR, newRows.length - 1);
		selectCell(nextR, selectedCell.c);
		showToast(`Deleted Row ${targetR + 1}`);
	}

	function deleteSelectedColumn() {
		if (!selectedCell || sheet.headers.length <= 1) return;
		const targetC = selectedCell.c;
		const newHeaders = sheet.headers.filter((_, idx) => idx !== targetC);
		const newRows = sheet.rows.map((row) => row.filter((_, idx) => idx !== targetC));
		updateSheet({ headers: newHeaders, rows: newRows });
		const nextC = Math.min(targetC, newHeaders.length - 1);
		selectCell(selectedCell.r, nextC);
		showToast(`Deleted Column ${targetC + 1}`);
	}

	function renameHeader(colIndex: number, newName: string) {
		const newHeaders = sheet.headers.map((h, idx) => (idx === colIndex ? newName : h));
		updateSheet({ headers: newHeaders });
	}

	function clearTable() {
		if (confirm('Clear all contents in this table?')) {
			updateSheet({
				headers: ['col_1', 'col_2', 'col_3'],
				rows: [
					['', '', ''],
					['', '', '']
				]
			});
			selectedCell = { r: 0, c: 0 };
			cellInputValue = '';
			showToast('Table cleared');
		}
	}

	// Export Generators
	function copyAsTSV() {
		const headerLine = sheet.headers.join('\t');
		const rowLines = sheet.rows.map((r) => r.join('\t')).join('\n');
		const fullText = `${headerLine}\n${rowLines}`;
		navigator.clipboard.writeText(fullText);
		showToast(`Copied ${sheet.rows.length} rows as TSV with headers to Clipboard!`);
	}

	function exportToCSV() {
		const escapeCsv = (val: string) => {
			if (val.includes(',') || val.includes('"') || val.includes('\n')) {
				return `"${val.replace(/"/g, '""')}"`;
			}
			return val;
		};
		const headerLine = sheet.headers.map(escapeCsv).join(',');
		const rowLines = sheet.rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
		const csvContent = `data:text/csv;charset=utf-8,${encodeURIComponent(`${headerLine}\n${rowLines}`)}`;
		const link = document.createElement('a');
		link.setAttribute('href', csvContent);
		link.setAttribute('download', `${sheet.title.replace(/\s+/g, '_').toLowerCase()}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		showToast(`Exported to CSV!`);
	}

	function copyAsMarkdown() {
		const headerLine = `| ${sheet.headers.join(' | ')} |`;
		const dividerLine = `| ${sheet.headers.map(() => '---').join(' | ')} |`;
		const rowLines = sheet.rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
		const mdText = `${headerLine}\n${dividerLine}\n${rowLines}`;
		navigator.clipboard.writeText(mdText);
		showToast(`Copied as Markdown Table to Clipboard!`);
	}

	function copyAsJSON() {
		const jsonObjects = sheet.rows.map((row) => {
			const obj: Record<string, string> = {};
			sheet.headers.forEach((h, idx) => {
				obj[h || `col_${idx + 1}`] = row[idx] ?? '';
			});
			return obj;
		});
		const jsonText = JSON.stringify(jsonObjects, null, 2);
		navigator.clipboard.writeText(jsonText);
		showToast(`Copied as JSON Array to Clipboard!`);
	}

	function copyAsSqlInsert() {
		const tableName = sheet.title.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'query_table';
		const cols = sheet.headers.map((h) => `\`${h}\``).join(', ');
		const inserts = sheet.rows.map((row) => {
			const vals = row.map((cell) => {
				if (cell === '' || cell.toLowerCase() === 'null') return 'NULL';
				if (!isNaN(Number(cell)) && cell.trim() !== '') return cell;
				return `'${cell.replace(/'/g, "''")}'`;
			}).join(', ');
			return `INSERT INTO \`${tableName}\` (${cols}) VALUES (${vals});`;
		}).join('\n');
		navigator.clipboard.writeText(inserts);
		showToast(`Copied SQL INSERT statements to Clipboard!`);
	}

	function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
		if (!text) return [''];
		const lines: string[] = [];
		const explicitLines = String(text).split('\n');

		explicitLines.forEach((explicitLine) => {
			if (ctx.measureText(explicitLine).width <= maxWidth) {
				lines.push(explicitLine);
				return;
			}

			const tokens = explicitLine.split(/(?<=[ ,;,@._/-])/);
			let currentLine = '';

			tokens.forEach((token) => {
				const testLine = currentLine + token;
				if (currentLine && ctx.measureText(testLine).width > maxWidth) {
					lines.push(currentLine.trim());
					currentLine = token;
				} else {
					currentLine = testLine;
				}
			});

			if (currentLine) {
				if (ctx.measureText(currentLine).width > maxWidth) {
					let charLine = '';
					for (let i = 0; i < currentLine.length; i++) {
						const char = currentLine[i];
						if (ctx.measureText(charLine + char).width > maxWidth) {
							lines.push(charLine);
							charLine = char;
						} else {
							charLine += char;
						}
					}
					if (charLine) lines.push(charLine);
				} else {
					lines.push(currentLine);
				}
			}
		});

		return lines.length > 0 ? lines : [''];
	}

	async function exportToHDImage(copyToClipboard: boolean = true) {
		const scale = 3;
		const fontHeader = `bold ${11 * scale}px Consolas, "Segoe UI", sans-serif`;
		const fontBody = `${11 * scale}px Consolas, "Segoe UI", sans-serif`;
		const cellPaddingX = 8 * scale;
		const headerHeight = 28 * scale;

		// Maximum column width limit to prevent table stretching too wide
		const maxColWidth = 240 * scale;
		const minColWidth = 60 * scale;

		// Temp canvas to measure text width
		const tempCanvas = document.createElement('canvas');
		const tempCtx = tempCanvas.getContext('2d');
		if (!tempCtx) return;

		// 1. Calculate dynamic column widths (capped at maxColWidth)
		const colWidths: number[] = sheet.headers.map((h, cIdx) => {
			tempCtx.font = fontHeader;
			let maxW = tempCtx.measureText(h || getColumnName(cIdx)).width + cellPaddingX * 2;

			sheet.rows.forEach((row) => {
				const cellText = String(row[cIdx] ?? '');
				tempCtx.font = fontBody;
				const w = tempCtx.measureText(cellText).width + cellPaddingX * 2;
				if (w > maxW) maxW = w;
			});

			return Math.min(Math.max(Math.ceil(maxW), minColWidth), maxColWidth);
		});

		// 2. Calculate row height dynamically for each row based on wrapped lines
		const lineGap = 15 * scale;
		const baseRowHeight = 24 * scale;

		const rowHeights: number[] = sheet.rows.map((row) => {
			let maxLinesInRow = 1;
			row.forEach((cell, cIdx) => {
				const availableW = colWidths[cIdx] - cellPaddingX * 2;
				tempCtx.font = fontBody;
				const lines = wrapCanvasText(tempCtx, String(cell ?? ''), availableW);
				if (lines.length > maxLinesInRow) maxLinesInRow = lines.length;
			});
			return Math.max(baseRowHeight, maxLinesInRow * lineGap + 8 * scale);
		});

		const totalTableWidth = colWidths.reduce((sum, w) => sum + w, 0);
		const totalTableHeight = headerHeight + rowHeights.reduce((sum, h) => sum + h, 0);

		// Canvas dimensions with minimal margin
		const margin = 4 * scale;
		const width = totalTableWidth + margin * 2;
		const height = totalTableHeight + margin * 2;

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.textBaseline = 'middle';

		// White background
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);

		const startX = margin;
		const startY = margin;

		// Header Row Background
		ctx.fillStyle = '#f8fafc';
		ctx.fillRect(startX, startY, totalTableWidth, headerHeight);

		ctx.strokeStyle = '#cbd5e1';
		ctx.lineWidth = 1 * scale;

		// Render Column Headers
		let currentX = startX;
		sheet.headers.forEach((h, cIdx) => {
			const colW = colWidths[cIdx];

			ctx.fillStyle = '#1e293b';
			ctx.font = fontHeader;
			ctx.textAlign = 'left';
			const headerText = h || getColumnName(cIdx);
			ctx.fillText(headerText, currentX + cellPaddingX, startY + headerHeight / 2);

			// Right border line for column
			ctx.beginPath();
			ctx.moveTo(currentX + colW, startY);
			ctx.lineTo(currentX + colW, startY + totalTableHeight);
			ctx.stroke();

			currentX += colW;
		});

		// Header bottom line
		ctx.beginPath();
		ctx.moveTo(startX, startY + headerHeight);
		ctx.lineTo(startX + totalTableWidth, startY + headerHeight);
		ctx.stroke();

		// Render Data Rows
		let currentY = startY + headerHeight;
		sheet.rows.forEach((row, rIdx) => {
			const currentH = rowHeights[rIdx];

			// Row bottom line
			ctx.beginPath();
			ctx.moveTo(startX, currentY + currentH);
			ctx.lineTo(startX + totalTableWidth, currentY + currentH);
			ctx.stroke();

			let cellX = startX;
			row.forEach((cell, cIdx) => {
				const colW = colWidths[cIdx];
				const availableW = colW - cellPaddingX * 2;
				const cellText = String(cell ?? '');

				if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cellText.trim())) {
					ctx.fillStyle = '#0284c7';
				} else {
					ctx.fillStyle = '#0f172a';
				}

				ctx.font = fontBody;
				ctx.textAlign = 'left';

				const lines = wrapCanvasText(ctx, cellText, availableW);
				const totalTextHeight = lines.length * lineGap;
				const startTextY = currentY + (currentH - totalTextHeight) / 2 + lineGap / 2;

				lines.forEach((line, lIdx) => {
					ctx.fillText(line, cellX + cellPaddingX, startTextY + lIdx * lineGap);
				});

				cellX += colW;
			});

			currentY += currentH;
		});

		// Outer Table Border Box
		ctx.strokeStyle = '#94a3b8';
		ctx.lineWidth = 1 * scale;
		ctx.strokeRect(startX, startY, totalTableWidth, totalTableHeight);

		// Convert canvas to Blob & Copy to Clipboard
		canvas.toBlob(async (blob) => {
			if (!blob) return;

			if (copyToClipboard) {
				try {
					await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
					showToast('HD Table Image copied to Clipboard!');
				} catch (e) {
					console.warn('Clipboard write failed, downloading image instead', e);
					downloadBlob(blob);
				}
			} else {
				downloadBlob(blob);
			}
		}, 'image/png');

		function downloadBlob(blob: Blob) {
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${sheet.title.replace(/\s+/g, '_').toLowerCase()}_hd.png`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			showToast('Copy Image downloaded successfully!');
		}
	}
</script>

<div
	tabindex="0"
	role="grid"
	aria-label="Excel Grid"
	class="relative flex h-full w-full flex-col overflow-hidden bg-base-100 font-sans text-xs text-base-content select-none"
	onkeydown={handleKeyDown}
>
	{#if toastMessage}
		<div
			class="pointer-events-none fixed top-4 right-4 z-50 rounded-lg bg-base-300 px-3 py-2 text-xs font-bold text-base-content shadow-2xl border border-base-content/10"
		>
			{toastMessage}
		</div>
	{/if}

	<header class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-base-content/10 bg-base-200/80 px-3 py-2">
		<div class="flex items-center gap-2">
			<div class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<rect width="18" height="18" x="3" y="3" rx="2"></rect>
					<path d="M3 9h18"></path>
					<path d="M3 15h18"></path>
					<path d="M9 3v18"></path>
					<path d="M15 3v18"></path>
				</svg>
			</div>

			<input
				type="text"
				bind:value={sheet.title}
				onchange={() => updateSheet({ title: sheet.title })}
				class="h-7 border-none bg-transparent text-sm font-bold text-base-content focus:bg-base-100 focus:px-2 focus:ring-1 focus:ring-primary focus:outline-none"
				placeholder="Sheet Title..."
			/>
		</div>

		<div class="flex flex-wrap items-center gap-1.5">
			<button
				onclick={pasteFromClipboard}
				class="btn btn-emerald btn-xs gap-1 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none"
				title="Paste Query Result table from Clipboard (TSV / Copy with headers)"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
				<span>Paste Clipboard</span>
			</button>

			<button
				onclick={() => (showPasteModal = true)}
				class="btn btn-ghost btn-xs gap-1 border border-base-content/10 hover:bg-base-300"
				title="Open Raw Paste Textarea"
			>
				<span>Raw Paste</span>
			</button>

			<div class="h-4 w-px bg-base-content/15 mx-1"></div>

			<button
				onclick={addRow}
				class="btn btn-ghost btn-xs gap-1 border border-base-content/10 hover:bg-base-300"
				title="Add Row to Bottom"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
				<span>+ Row</span>
			</button>

			<button
				onclick={addColumn}
				class="btn btn-ghost btn-xs gap-1 border border-base-content/10 hover:bg-base-300"
				title="Add Column to Right"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
				<span>+ Col</span>
			</button>

			<button
				onclick={deleteSelectedRow}
				disabled={!selectedCell}
				class="btn btn-ghost btn-xs text-error border border-base-content/10 hover:bg-error/10 disabled:opacity-30"
				title="Delete Active Row"
			>
				<span>- Row</span>
			</button>

			<button
				onclick={deleteSelectedColumn}
				disabled={!selectedCell}
				class="btn btn-ghost btn-xs text-error border border-base-content/10 hover:bg-error/10 disabled:opacity-30"
				title="Delete Active Column"
			>
				<span>- Col</span>
			</button>

			<div class="h-4 w-px bg-base-content/15 mx-1"></div>

			<div class="relative flex items-center">
				<input
					type="text"
					bind:value={filterQuery}
					placeholder="Search cell..."
					class="h-6 w-32 rounded border border-base-content/20 bg-base-100 px-2 pl-6 text-[11px] focus:w-44 focus:border-primary focus:outline-none transition-all"
				/>
				<svg class="absolute left-1.5 text-base-content/40" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
			</div>

			<button
				onclick={() => (isWrapTextEnabled = !isWrapTextEnabled)}
				class="btn btn-xs gap-1 border border-base-content/10 hover:bg-base-300 {isWrapTextEnabled
					? 'bg-primary/10 text-primary border-primary/30 font-bold'
					: 'btn-ghost opacity-70'}"
				title="Toggle text wrapping inside cells"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
				<span>Wrap Text</span>
			</button>

			<button
				onclick={() => exportToHDImage(true)}
				class="btn btn-xs gap-1 border-none bg-sky-600 hover:bg-sky-700 text-white shadow-sm font-bold"
				title="Copy table as high-definition crisp PNG image directly to Clipboard"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>
				<span>Copy Image</span>
			</button>

			<div class="dropdown dropdown-end">
				<div tabindex="0" role="button" class="btn btn-primary btn-xs gap-1 shadow-sm">
					<span>Export</span>
					<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
				</div>
				<ul class="dropdown-content menu z-50 mt-1 w-52 rounded-lg border border-base-content/10 bg-base-100 p-1 shadow-xl">
					<li>
						<button onclick={() => exportToHDImage(false)} class="text-xs font-bold text-sky-500">
							Download Copy Image (PNG)
						</button>
					</li>
					<li>
						<button onclick={() => exportToHDImage(true)} class="text-xs font-bold text-sky-500">
							Copy Image to Clipboard
						</button>
					</li>
					<li class="my-0.5 border-t border-base-content/10"></li>
					<li>
						<button onclick={copyAsTSV} class="text-xs">
							Copy TSV (Excel Ready)
						</button>
					</li>
					<li>
						<button onclick={exportToCSV} class="text-xs">
							Download CSV File
						</button>
					</li>
					<li>
						<button onclick={copyAsMarkdown} class="text-xs">
							Copy Markdown Table
						</button>
					</li>
					<li>
						<button onclick={copyAsJSON} class="text-xs">
							{'{}'} Copy JSON Objects
						</button>
					</li>
					<li>
						<button onclick={copyAsSqlInsert} class="text-xs">
							Copy SQL INSERT Query
						</button>
					</li>
					<li class="mt-1 border-t border-base-content/10 pt-1">
						<button onclick={clearTable} class="text-xs text-error hover:bg-error/10">
							Clear Table
						</button>
					</li>
				</ul>
			</div>
		</div>
	</header>

	<div class="flex shrink-0 items-center gap-2 border-b border-base-content/10 bg-base-100 px-3 py-1 text-xs">
		<div class="flex h-6 min-w-24 items-center justify-center rounded bg-base-200 px-2 font-mono text-[11px] font-bold text-primary border border-base-content/10">
			{selectedCellAddress}
		</div>

		<!-- Formula Input Icon -->
		<span class="font-serif italic font-bold text-base-content/50 select-none">fx</span>

		<!-- Cell Content Input -->
		<input
			type="text"
			value={cellInputValue}
			oninput={handleFormulaBarChange}
			placeholder="Enter cell value or formula..."
			class="h-6 flex-1 rounded border border-base-content/15 bg-base-100 px-2 text-xs font-mono text-base-content focus:border-primary focus:outline-none"
		/>
	</div>

	<!-- 3. Excel Interactive Grid Surface -->
	<div class="vscode-scrollbar relative flex-1 overflow-auto bg-base-100">
		<table class="w-full border-collapse text-left font-mono text-[11px]">
			<!-- Header Row -->
			<thead>
				<tr class="sticky top-0 z-20 bg-base-200 border-b border-base-content/20 shadow-sm">
					<!-- Top-Left Select-All Corner -->
					<th class="w-10 border-r border-base-content/20 bg-base-300 p-1 text-center font-bold text-base-content/50">
						#
					</th>
					{#each sheet.headers as header, colIdx (colIdx)}
						<th class="group relative border-r border-base-content/20 bg-base-200 p-1 font-semibold text-base-content/80 hover:bg-base-300">
							<div class="flex items-center justify-between gap-1">
								<span class="text-[10px] font-bold text-base-content/40">{getColumnName(colIdx)}</span>
								<input
									type="text"
									value={header}
									onchange={(e) => renameHeader(colIdx, (e.target as HTMLInputElement).value)}
									class="w-full border-none bg-transparent font-semibold text-base-content focus:bg-base-100 focus:px-1 focus:outline-none"
								/>
							</div>
						</th>
					{/each}
				</tr>
			</thead>

			<!-- Table Body Rows -->
			<tbody>
				{#each filteredRowsWithIndex as { row, originalIndex: rIdx } (rIdx)}
					<tr class="group border-b border-base-content/10 hover:bg-base-200/40">
						<!-- Row Index Number Header -->
						<td class="sticky left-0 z-10 border-r border-base-content/20 bg-base-200 p-1 text-center font-bold text-base-content/50 group-hover:bg-base-300">
							{rIdx + 1}
						</td>

						{#each row as cell, cIdx (cIdx)}
							{@const isSelected = selectedCell?.r === rIdx && selectedCell?.c === cIdx}
							{@const isEditing = editingCell?.r === rIdx && editingCell?.c === cIdx}

							<!-- Cell Container -->
							<td
								role="gridcell"
								tabindex="0"
								onclick={() => selectCell(rIdx, cIdx)}
								ondblclick={() => startEditing(rIdx, cIdx)}
								onkeydown={(e) => e.key === 'Enter' && startEditing(rIdx, cIdx)}
								class="relative border-r border-base-content/10 p-0 transition-colors select-none
									{isSelected ? 'bg-emerald-500/10 font-medium text-base-content' : 'hover:bg-base-200/50'}"
							>
								{#if isEditing}
									<!-- In-Cell Form Input -->
									<input
										type="text"
										bind:value={cellInputValue}
										onblur={commitCellEdit}
										use:focusElement
										class="absolute inset-0 z-30 h-full w-full border-2 border-emerald-500 bg-base-100 px-2.5 py-1 text-xs font-mono text-base-content shadow-lg outline-none"
									/>
								{:else}
									<div class="w-full px-2.5 py-1 text-xs leading-normal font-mono {isWrapTextEnabled ? 'whitespace-pre-wrap break-all min-w-30 max-w-70' : 'h-7 truncate min-w-25'}">
										{cell}
									</div>
								{/if}

								<!-- Excel Selection Active Border Frame -->
								{#if isSelected && !isEditing}
									<div class="pointer-events-none absolute inset-0 z-20 border-2 border-emerald-600 shadow-sm">
										<div class="absolute bottom-0 right-0 h-1.5 w-1.5 bg-emerald-600"></div>
									</div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- 4. Bottom Status Bar (Excel Stats Bar) -->
	<footer class="flex shrink-0 items-center justify-between border-t border-base-content/10 bg-base-200 px-3 py-1 text-[11px] text-base-content/70 select-none">
		<div class="flex items-center gap-3">
			<span class="font-medium">Rows: <strong>{tableStats.rowCount}</strong></span>
			<span class="font-medium">Cols: <strong>{tableStats.colCount}</strong></span>
			<span class="font-medium">Cells: <strong>{tableStats.totalCells}</strong></span>
		</div>

		<!-- Right Side: Numeric Summary Stats -->
		<div class="flex items-center gap-4 font-mono text-[10px]">
			{#if tableStats.numericCount > 0}
				<span>Count: <strong class="text-base-content">{tableStats.numericCount}</strong></span>
				<span>Sum: <strong class="text-emerald-600 dark:text-emerald-400">{tableStats.sum.toLocaleString()}</strong></span>
				<span>Avg: <strong class="text-base-content">{tableStats.avg.toFixed(2)}</strong></span>
				<span>Min: <strong class="text-base-content">{tableStats.min}</strong></span>
				<span>Max: <strong class="text-base-content">{tableStats.max}</strong></span>
			{:else}
				<span class="text-base-content/40">Ready • Click cell to select / edit</span>
			{/if}
		</div>
	</footer>

	<!-- Toast Notification Banner -->
	{#if toastMessage}
		<div class="absolute bottom-10 right-4 z-50 rounded-lg bg-base-300 border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shadow-xl backdrop-blur-md">
			{toastMessage}
		</div>
	{/if}

	<!-- Raw Paste Modal Fallback -->
	{#if showPasteModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
			<div class="flex w-full max-w-xl flex-col gap-3 rounded-xl border border-base-content/15 bg-base-100 p-4 shadow-2xl">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold text-base-content">Paste Query Table (TSV / CSV)</h3>
					<button onclick={() => (showPasteModal = false)} class="btn btn-ghost btn-xs">✕</button>
				</div>

				<p class="text-xs text-base-content/70">
					Paste text directly from SQL Query Client (DBeaver, SSMS, PgAdmin, VSCode, Excel, CSV) below:
				</p>

				<textarea
					bind:value={pasteRawText}
					rows="8"
					placeholder="Paste table data here (e.g. id&#9;username&#9;email)..."
					class="w-full rounded-lg border border-base-content/20 bg-base-200 p-3 font-mono text-xs focus:border-primary focus:outline-none"
				></textarea>

				<div class="flex items-center justify-between pt-1">
					<label class="flex items-center gap-2 text-xs cursor-pointer">
						<input type="checkbox" bind:checked={hasHeaderInput} class="checkbox checkbox-xs checkbox-primary" />
						<span>First row contains Column Headers</span>
					</label>

					<div class="flex items-center gap-2">
						<button onclick={() => (showPasteModal = false)} class="btn btn-ghost btn-xs">Cancel</button>
						<button onclick={() => handlePasteData(pasteRawText)} class="btn btn-primary btn-xs">
							Process & Display Excel
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
