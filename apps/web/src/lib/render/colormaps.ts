import * as THREE from 'three';

export interface Colormap {
	name: string;
	stops: [number, number, number][];
}

// Stops are sampled from the cmocean RGB tables. Values are normalized to
// [0, 1] so the registry remains independent of the texture format.
export const COLORMAPS: Record<string, Colormap> = {
	thermal: {
		name: 'thermal',
		stops: [
			[0.015556013, 0.138244245, 0.201810886],
			[0.172072823, 0.201102729, 0.585918385],
			[0.453560260, 0.286513380, 0.574176482],
			[0.686381616, 0.371824320, 0.510868985],
			[0.919974063, 0.472578677, 0.343676382],
			[0.985593690, 0.706182828, 0.238655347],
			[0.909041842, 0.982157406, 0.355507806]
		]
	},
	haline: {
		name: 'haline',
		stops: [
			[0.162952955, 0.095215917, 0.422572925],
			[0.076944189, 0.262091561, 0.610923830],
			[0.125401894, 0.431198711, 0.543811373],
			[0.232815070, 0.573622241, 0.530082060],
			[0.351011700, 0.726567625, 0.470835903],
			[0.667404707, 0.847051315, 0.361154274],
			[0.994080581, 0.936727582, 0.602669996]
		]
	},
	viridis: {
		name: 'viridis',
		stops: [
			[0.267004, 0.004874, 0.329415],
			[0.190631, 0.407061, 0.556089],
			[0.208030, 0.718701, 0.472873],
			[0.993248, 0.906157, 0.143936]
		]
	},
	balance: {
		name: 'balance',
		stops: [
			[0.093176302, 0.111173329, 0.261512389],
			[0.045209385, 0.367274935, 0.745488909],
			[0.457321093, 0.664897388, 0.743433526],
			[0.943876858, 0.927090582, 0.924147841],
			[0.815785797, 0.544641201, 0.452041721],
			[0.648361836, 0.131315449, 0.143809378],
			[0.236056365, 0.035297480, 0.069437442]
		]
	}
};

const LUT_SIZE = 256;
const textureCache = new Map<string, THREE.DataTexture>();

function sample(stops: [number, number, number][], position: number): [number, number, number] {
	const scaled = position * (stops.length - 1);
	const index = Math.min(Math.floor(scaled), stops.length - 2);
	const amount = scaled - index;
	const lower = stops[index];
	const upper = stops[index + 1];
	return [
		lower[0] + (upper[0] - lower[0]) * amount,
		lower[1] + (upper[1] - lower[1]) * amount,
		lower[2] + (upper[2] - lower[2]) * amount
	];
}

export function toLUTTexture(name: string): THREE.DataTexture {
	const cached = textureCache.get(name);
	if (cached) return cached;

	const colormap = COLORMAPS[name];
	if (!colormap) throw new Error(`Unknown colormap: ${name}`);

	const data = new Uint8Array(LUT_SIZE * 4);
	for (let index = 0; index < LUT_SIZE; index += 1) {
		const color = sample(colormap.stops, index / (LUT_SIZE - 1));
		const offset = index * 4;
		data[offset] = Math.round(color[0] * 255);
		data[offset + 1] = Math.round(color[1] * 255);
		data[offset + 2] = Math.round(color[2] * 255);
		data[offset + 3] = 255;
	}

	const texture = new THREE.DataTexture(data, LUT_SIZE, 1, THREE.RGBAFormat);
	texture.name = `${name}-lut`;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.needsUpdate = true;
	textureCache.set(name, texture);
	return texture;
}