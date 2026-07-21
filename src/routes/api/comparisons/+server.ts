import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getComparisons, saveComparisons, type Comparison } from '$lib/server/comparisons';

export const GET: RequestHandler = async () => {
	try {
		const comparisons = getComparisons();
		return json({ success: true, comparisons });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { id, title, beforeCode, afterCode, viewMode, layout } = body;

		if (!title || typeof title !== 'string') {
			return json({ success: false, error: 'Title is required' }, { status: 400 });
		}

		const comparisons = getComparisons();
		let targetComparison: Comparison;

		if (id) {
			const index = comparisons.findIndex((c) => c.id === id);
			if (index !== -1) {
				comparisons[index] = {
					...comparisons[index],
					title: title.trim(),
					beforeCode: beforeCode ?? '',
					afterCode: afterCode ?? '',
					viewMode: viewMode || 'edit',
					layout: layout || 'split',
					updatedAt: Date.now()
				};
				targetComparison = comparisons[index];
			} else {
				targetComparison = {
					id,
					title: title.trim(),
					beforeCode: beforeCode ?? '',
					afterCode: afterCode ?? '',
					viewMode: viewMode || 'edit',
					layout: layout || 'split',
					createdAt: Date.now(),
					updatedAt: Date.now()
				};
				comparisons.push(targetComparison);
			}
		} else {
			targetComparison = {
				id: `compare-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
				title: title.trim(),
				beforeCode: beforeCode ?? '',
				afterCode: afterCode ?? '',
				viewMode: viewMode || 'edit',
				layout: layout || 'split',
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
			comparisons.push(targetComparison);
		}

		saveComparisons(comparisons);
		return json({ success: true, comparison: targetComparison, comparisons });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { id } = body;

		if (!id) {
			return json({ success: false, error: 'ID is required' }, { status: 400 });
		}

		const comparisons = getComparisons();
		const nextComparisons = comparisons.filter((c) => c.id !== id);

		if (comparisons.length === nextComparisons.length) {
			return json({ success: false, error: 'Comparison not found' }, { status: 404 });
		}

		saveComparisons(nextComparisons);
		return json({ success: true, comparisons: nextComparisons });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
