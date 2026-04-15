import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const initialTheme = browser ? localStorage.getItem('theme') || 'cupcake' : 'cupcake';
export const theme = writable<string>(initialTheme);

theme.subscribe((value) => {
	if (browser) {
		localStorage.setItem('theme', value);
		document.documentElement.setAttribute('data-theme', value);
	}
});

export const themes = [
	'light',
	'dark',
	'cupcake',
	'bumblebee',
	'emerald',
	'corporate',
	'synthwave',
	'retro',
	'cyberpunk',
	'valentine',
	'halloween',
	'garden',
	'forest',
	'aqua',
	'lofi',
	'pastel',
	'fantasy',
	'wireframe',
	'black',
	'luxury',
	'dracula',
	'cmyk',
	'autumn',
	'business',
	'acid',
	'lemonade',
	'night',
	'coffee',
	'winter',
	'dim',
	'nord',
	'sunset',
	'caramellatte',
	'abyss',
	'silk'
];
