import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSnippets, saveSnippets, type Snippet } from '$lib/server/snippets';

export const GET: RequestHandler = async () => {
	try {
		const snippets = getSnippets();
		return json({ success: true, snippets });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { id, title, content, language, description } = body;

		if (!title || typeof title !== 'string') {
			return json({ success: false, error: 'Title is required' }, { status: 400 });
		}
		if (typeof content !== 'string') {
			return json({ success: false, error: 'Content is required' }, { status: 400 });
		}

		const snippets = getSnippets();
		let targetSnippet: Snippet;

		if (id) {
			const index = snippets.findIndex((s) => s.id === id);
			if (index !== -1) {
				snippets[index] = {
					...snippets[index],
					title: title.trim(),
					content,
					language: (language || 'text').trim(),
					description: (description || '').trim(),
					updatedAt: Date.now()
				};
				targetSnippet = snippets[index];
			} else {
				targetSnippet = {
					id,
					title: title.trim(),
					content,
					language: (language || 'text').trim(),
					description: (description || '').trim(),
					createdAt: Date.now(),
					updatedAt: Date.now()
				};
				snippets.push(targetSnippet);
			}
		} else {
			targetSnippet = {
				id: `snippet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
				title: title.trim(),
				content,
				language: (language || 'text').trim(),
				description: (description || '').trim(),
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
			snippets.push(targetSnippet);
		}

		saveSnippets(snippets);
		return json({ success: true, snippet: targetSnippet, snippets });
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

		const snippets = getSnippets();
		const nextSnippets = snippets.filter((s) => s.id !== id);

		if (snippets.length === nextSnippets.length) {
			return json({ success: false, error: 'Snippet not found' }, { status: 404 });
		}

		saveSnippets(nextSnippets);
		return json({ success: true, snippets: nextSnippets });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
