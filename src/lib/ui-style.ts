import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { theme } from '$lib/theme';

export type UiStyleId = 'modern' | 'neo-brutalism' | 'flat-design' | 'terminal' | 'minimal';

export const uiStyles: Array<{ id: UiStyleId; label: string; description: string }> = [
	{
		id: 'modern',
		label: 'Modern',
		description: 'Soft panels, balanced shadows, and polished product-tool chrome.'
	},
	{
		id: 'neo-brutalism',
		label: 'Neo-Brutalism',
		description: 'Hard borders, offset shadows, compact confidence, and louder contrast.'
	},
	{
		id: 'flat-design',
		label: 'Flat Design',
		description: 'Low elevation, clean surfaces, restrained color, and fast scanning.'
	},
	{
		id: 'terminal',
		label: 'Terminal',
		description: 'Sharper edges, monospace rhythm, command-console density.'
	},
	{
		id: 'minimal',
		label: 'Minimal',
		description: 'Quiet surfaces, softer contrast, fewer visual edges.'
	}
];

const storageKey = 'ohmycode-ui-style';
const initialStyle = (browser ? localStorage.getItem(storageKey) : null) as UiStyleId | null;

export const uiStyle = writable<UiStyleId>(
	uiStyles.some((style) => style.id === initialStyle) ? initialStyle! : 'modern'
);

uiStyle.subscribe((value) => {
	if (!browser) return;

	localStorage.setItem(storageKey, value);
	document.documentElement.dataset.uiStyle = value;
});

export function setUiStyle(value: UiStyleId) {
	uiStyle.set(value);

	if (value === 'neo-brutalism') {
		theme.set('neo-brutalism');
	}
}
