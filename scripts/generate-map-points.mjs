/**
 * Generates the dotted map of the British Isles and nearby Europe shown on the
 * contact page (components/Contact/LocationMap).
 *
 * Lays an offset dot grid over a simple equirectangular projection of the
 * region and keeps the dots that fall on land (Natural Earth 50m via
 * world-atlas), splitting UK dots from the rest. Each set is written as one
 * SVG path of zero-length segments (drawn as dots with round line caps), along
 * with the projected position of every place the map marks and a few chart
 * lines, to components/Contact/LocationMap/mapData.json.
 *
 * Re-run after changing the region, density or places:
 *   node scripts/generate-map-points.mjs
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'components/Contact/LocationMap/mapData.json');

// Region (degrees) and grid density (viewBox units)
const bounds = { west: 68, east: 86, south: 9, north: 27 };
const width = 480;
const step = 8;
const rowStep = 7;

// Mumbai, where the beacon sits
const places = {
  home: [19.076, 72.8777],
};

// Faint chart lines (degrees)
const graticule = { lat: [12, 16, 20, 24], lng: [70, 75, 80, 85] };

const countryId = '356';

const read = async (file) => JSON.parse(await readFile(require.resolve(file), 'utf-8'));
const landTopology = await read('world-atlas/land-50m.json');
const countryTopology = await read('world-atlas/countries-50m.json');
const land = feature(landTopology, landTopology.objects.land);
const country = feature(countryTopology, countryTopology.objects.countries).features.find(
  (c) => String(c.id) === countryId
);

// Equirectangular, with longitude squeezed for the region's mid latitude
const midLat = (bounds.north + bounds.south) / 2;
const squeeze = Math.cos((midLat * Math.PI) / 180);
const scale = width / ((bounds.east - bounds.west) * squeeze);
const height = Math.round((bounds.north - bounds.south) * scale);
const project = (lat, lng) => [(lng - bounds.west) * squeeze * scale, (bounds.north - lat) * scale];
const unproject = (x, y) => [bounds.west + x / (squeeze * scale), bounds.north - y / scale];

const rows = { uk: [], land: [] };
for (let y = rowStep / 2, row = 0; y < height; y += rowStep, row++) {
  const countryRow = [];
  const landRow = [];
  // Offset every other row by half a step for an even, hex-like weave
  for (let x = row % 2 ? step : step / 2; x < width; x += step) {
    const point = unproject(x, y);
    if (geoContains(country, point)) {
      countryRow.push(x);
    } else if (geoContains(land, point)) {
      landRow.push(x);
    }
  }
  if (countryRow.length) rows.uk.push([y, countryRow]);
  if (landRow.length) rows.land.push([y, landRow]);
}

/** One absolute move per row, then relative hops between that row's dots */
const toPath = (set) =>
  set
    .map(([y, xs]) => xs.map((x, i) => (i ? `m${x - xs[i - 1]} 0h0` : `M${x} ${y}h0`)).join(''))
    .join('');

const round = (n) => Math.round(n * 10) / 10;
const data = {
  width,
  height,
  uk: toPath(rows.uk),
  land: toPath(rows.land),
  places: Object.fromEntries(
    Object.entries(places).map(([name, [lat, lng]]) => [name, project(lat, lng).map(round)])
  ),
  graticule: {
    y: graticule.lat.map((lat) => round(project(lat, 0)[1])),
    x: graticule.lng.map((lng) => round(project(0, lng)[0])),
  },
};

await writeFile(out, `${JSON.stringify(data, null, 2)}\n`);
const count = (set) => set.reduce((sum, [, xs]) => sum + xs.length, 0);
console.log(
  `wrote ${count(rows.uk)} India + ${count(rows.land)} land dots (${width}×${height}) to ${path.relative(root, out)}`
);
