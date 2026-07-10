import type { MetadataValues } from './exif-engine';

const MAKES_MODELS: [string, string[]][] = [
  ['Canon', ['EOS R5', 'EOS R6 Mark II', 'EOS 5D Mark IV', 'EOS 90D']],
  ['NIKON CORPORATION', ['NIKON Z8', 'NIKON D850', 'NIKON Z6 III']],
  ['SONY', ['ILCE-7M4', 'ILCE-7RM5', 'ILCE-6700']],
  ['FUJIFILM', ['X-T5', 'X-H2S', 'GFX100S']],
  ['Apple', ['iPhone 15 Pro', 'iPhone 14', 'iPhone 13 Pro Max']],
];

const LENSES: [string, string][] = [
  ['Canon', 'RF 24-70mm F2.8L IS USM'],
  ['Canon', 'RF 50mm F1.2L USM'],
  ['NIKON', 'NIKKOR Z 24-120mm f/4 S'],
  ['SONY', 'FE 35mm F1.4 GM'],
  ['SIGMA', '85mm F1.4 DG DN Art'],
  ['FUJIFILM', 'XF 16-55mm F2.8 R LM WR'],
];

const SOFTWARE = ['Adobe Lightroom Classic 13.2', 'Capture One 23', 'Adobe Photoshop 25.0', 'darktable 4.6', 'RAW Therapee 5.9'];
const CITIES: { name: string; lat: number; lon: number; alt: number }[] = [
  { name: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503, alt: 40 },
  { name: 'Paris, France', lat: 48.8566, lon: 2.3522, alt: 35 },
  { name: 'New York, USA', lat: 40.7128, lon: -74.006, alt: 10 },
  { name: 'Reykjavik, Iceland', lat: 64.1466, lon: -21.9426, alt: 20 },
  { name: 'Cape Town, South Africa', lat: -33.9249, lon: 18.4241, alt: 25 },
  { name: 'Sydney, Australia', lat: -33.8688, lon: 151.2093, alt: 15 },
  { name: 'Bali, Indonesia', lat: -8.3405, lon: 115.092, alt: 100 },
  { name: 'Marrakesh, Morocco', lat: 31.6295, lon: -7.9811, alt: 466 },
];
const FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Riley', 'Casey'];
const LAST_NAMES = ['Rivera', 'Chen', 'Novak', 'Alaoui', 'Kowalski', 'Tanaka', 'Larsen'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number, decimals = 1): number {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}
function randDateWithin(daysBack: number): string {
  const now = Date.now();
  const past = now - randInt(0, daysBack) * 86400000 - randInt(0, 86399) * 1000;
  const d = new Date(past);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SHUTTER_SPEEDS = ['1/125', '1/250', '1/500', '1/1000', '1/60', '1/2000', '1/30', '1/4000'];
const APERTURES = [1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11];
const FOCAL_LENGTHS = [24, 35, 50, 85, 100, 135, 200];

/** Generate a full, internally-consistent set of random metadata values covering every supported field. */
export function randomizeAll(): MetadataValues {
  const [make, models] = pick(MAKES_MODELS);
  const model = pick(models);
  const [lensMake, lensModel] = pick(LENSES);
  const city = pick(CITIES);
  const focal = pick(FOCAL_LENGTHS);
  const dateStr = randDateWithin(730);
  const author = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const jitter = () => randFloat(-0.35, 0.35, 4);

  return {
    Make: make,
    Model: model,
    LensMake: lensMake,
    LensModel: lensModel,
    Software: pick(SOFTWARE),
    ExposureTime: pick(SHUTTER_SPEEDS),
    FNumber: String(pick(APERTURES)),
    ISOSpeedRatings: String(pick([100, 200, 400, 800, 1600, 3200])),
    ExposureBiasValue: String(randFloat(-2, 2, 1)),
    FocalLength: String(focal),
    FocalLengthIn35mmFilm: String(Math.round(focal * randFloat(1, 1.6, 2))),
    ExposureProgram: String(pick([1, 2, 3, 4])),
    MeteringMode: String(pick([1, 2, 5])),
    WhiteBalance: String(pick([0, 1])),
    Flash: String(pick([0, 16, 24])),
    Orientation: '1',
    DateTimeOriginal: dateStr,
    DateTimeDigitized: dateStr,
    DateTime: dateStr,
    GPSLatitude: String(Number((city.lat + jitter()).toFixed(6))),
    GPSLongitude: String(Number((city.lon + jitter()).toFixed(6))),
    GPSAltitude: String(city.alt + randInt(-5, 20)),
    GPSLocationName: city.name,
    Artist: author,
    Copyright: `© ${new Date().getFullYear()} ${author}`,
    ImageDescription: `Captured near ${city.name}`,
  };
}
