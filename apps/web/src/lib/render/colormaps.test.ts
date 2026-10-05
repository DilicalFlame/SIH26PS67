import { describe, expect, it } from 'vitest';
import { COLORMAPS, toLUTTexture } from './colormaps';

describe('colormap registry', () => {
	it('ships the five required colormaps', () => {
		expect(Object.keys(COLORMAPS)).toEqual(['thermal', 'haline', 'viridis', 'balance', 'turbo']);
	});

	it.each([
		['thermal', [4, 35, 51, 255], [232, 250, 91, 255]],
		['haline', [42, 24, 108, 255], [253, 239, 154, 255]],
		['viridis', [68, 1, 84, 255], [253, 231, 37, 255]],
		['balance', [24, 28, 67, 255], [60, 9, 18, 255]],
		['turbo', [35, 23, 27, 255], [144, 13, 0, 255]]
	] as const)('%s has documented endpoint colours', (name, first, last) => {
		const texture = toLUTTexture(name);
		const data = texture.image.data as Uint8Array;
		expect([...data.slice(0, 4)]).toEqual(first);
		expect([...data.slice(-4)]).toEqual(last);
	});

	it('returns the same texture instance for repeated requests', () => {
		expect(toLUTTexture('thermal')).toBe(toLUTTexture('thermal'));
	});
});