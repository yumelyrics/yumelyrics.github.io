import piexif from 'piexifjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetadataValues = Record<string, string>;

export interface ParsedImage {
  dataUrl: string; // base64 data URL of the original JPEG
  values: MetadataValues;
  supported: boolean; // false for non-JPEG (e.g. PNG) — metadata editing unsupported
}

// ---------------------------------------------------------------------------
// String sanitization for piexifjs writes
// ---------------------------------------------------------------------------
//
// piexifjs packs EXIF ASCII/UNDEFINED string tags one JS char code = one
// byte. Any character with a code point above 0xFF (curly quotes " ' ,
// en/em dashes – —, CJK, emoji, ...) breaks that packing: piexif.dump()/
// insert() still return *something*, but the resulting data URL is no
// longer valid base64. dataUrlToBlob()'s atob() call then throws — and
// since that happens synchronously inside the download button's onClick
// with nothing catching it, the button appears to do nothing at all.
// This is why edits or removals could look like they "didn't really
// change" the file, and why Randomize (which always joins the Description
// and Location fields with an em dash, see writeImage below) reliably
// broke downloading. Sanitizing every string before handing it to
// piexifjs prevents the corruption instead of just crashing on it later.
const SMART_PUNCTUATION: [RegExp, string][] = [
  [/[\u2014\u2013]/g, '-'],   // em dash, en dash
  [/[\u2018\u2019]/g, "'"],   // curly single quotes
  [/[\u201C\u201D]/g, '"'],   // curly double quotes
  [/\u2026/g, '...'],         // ellipsis
];
function sanitizeExifString(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [pattern, replacement] of SMART_PUNCTUATION) out = out.replace(pattern, replacement);
  // Anything still outside Latin-1 (0x00-0xFF) can't be packed safely by
  // piexifjs — drop it rather than let it silently corrupt the file.
  out = out.replace(/[^\u0000-\u00FF]/g, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Helpers: rational <-> number conversions used by EXIF binary format
// ---------------------------------------------------------------------------

function toRational(value: number, precision = 1000): [number, number] {
  if (Number.isInteger(value)) return [value, 1];
  return [Math.round(value * precision), precision];
}

function fromRational(pair: unknown): number | null {
  if (!Array.isArray(pair) || pair.length !== 2) return null;
  const [num, den] = pair as [number, number];
  if (!den) return null;
  return num / den;
}

function dmsToDeg(dms: unknown, ref: unknown): number | null {
  if (!Array.isArray(dms) || dms.length !== 3) return null;
  const [d, m, s] = dms.map(fromRational);
  if (d === null || m === null || s === null) return null;
  let deg = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') deg = -deg;
  return deg;
}

function degToDms(deg: number): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = (minFloat - m) * 60;
  return [[d, 1], [m, 1], toRational(s, 1000)];
}

// ---------------------------------------------------------------------------
// Read a JPEG data URL into a flat form-friendly values map
// ---------------------------------------------------------------------------

export function readImage(dataUrl: string): ParsedImage {
  if (!dataUrl.startsWith('data:image/jpeg') && !dataUrl.startsWith('data:image/jpg')) {
    return { dataUrl, values: {}, supported: false };
  }

  let exifObj: piexif.ExifDict;
  try {
    exifObj = piexif.load(dataUrl);
  } catch {
    // No EXIF segment present yet — start from an empty structure.
    exifObj = { '0th': {}, Exif: {}, GPS: {}, '1st': {}, Interop: {}, thumbnail: null } as unknown as piexif.ExifDict;
  }

  const zeroth = (exifObj['0th'] ?? {}) as Record<number, unknown>;
  const exif = (exifObj['Exif'] ?? {}) as Record<number, unknown>;
  const gps = (exifObj['GPS'] ?? {}) as Record<number, unknown>;

  const values: MetadataValues = {};

  const setStr = (key: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    values[key] = String(v).replace(/\0+$/, '').trim();
  };

  setStr('Make', zeroth[piexif.ImageIFD.Make]);
  setStr('Model', zeroth[piexif.ImageIFD.Model]);
  setStr('Software', zeroth[piexif.ImageIFD.Software]);
  setStr('Artist', zeroth[piexif.ImageIFD.Artist]);
  setStr('Copyright', zeroth[piexif.ImageIFD.Copyright]);
  setStr('ImageDescription', zeroth[piexif.ImageIFD.ImageDescription]);
  if (zeroth[piexif.ImageIFD.Orientation] !== undefined) values['Orientation'] = String(zeroth[piexif.ImageIFD.Orientation]);
  setStr('DateTime', zeroth[piexif.ImageIFD.DateTime]);

  setStr('LensMake', exif[piexif.ExifIFD.LensMake]);
  setStr('LensModel', exif[piexif.ExifIFD.LensModel]);
  setStr('DateTimeOriginal', exif[piexif.ExifIFD.DateTimeOriginal]);
  setStr('DateTimeDigitized', exif[piexif.ExifIFD.DateTimeDigitized]);

  const exposureTime = fromRational(exif[piexif.ExifIFD.ExposureTime]);
  if (exposureTime !== null) {
    values['ExposureTime'] = exposureTime >= 1 ? String(exposureTime) : `1/${Math.round(1 / exposureTime)}`;
  }
  const fNumber = fromRational(exif[piexif.ExifIFD.FNumber]);
  if (fNumber !== null) values['FNumber'] = String(fNumber);
  const iso = exif[piexif.ExifIFD.ISOSpeedRatings];
  if (iso !== undefined) values['ISOSpeedRatings'] = String(Array.isArray(iso) ? iso[0] : iso);
  const bias = fromRational(exif[piexif.ExifIFD.ExposureBiasValue]);
  if (bias !== null) values['ExposureBiasValue'] = String(bias);
  const focal = fromRational(exif[piexif.ExifIFD.FocalLength]);
  if (focal !== null) values['FocalLength'] = String(focal);
  if (exif[piexif.ExifIFD.FocalLengthIn35mmFilm] !== undefined) values['FocalLengthIn35mmFilm'] = String(exif[piexif.ExifIFD.FocalLengthIn35mmFilm]);
  if (exif[piexif.ExifIFD.ExposureProgram] !== undefined) values['ExposureProgram'] = String(exif[piexif.ExifIFD.ExposureProgram]);
  if (exif[piexif.ExifIFD.MeteringMode] !== undefined) values['MeteringMode'] = String(exif[piexif.ExifIFD.MeteringMode]);
  if (exif[piexif.ExifIFD.WhiteBalance] !== undefined) values['WhiteBalance'] = String(exif[piexif.ExifIFD.WhiteBalance]);
  if (exif[piexif.ExifIFD.Flash] !== undefined) values['Flash'] = String(exif[piexif.ExifIFD.Flash]);

  const lat = dmsToDeg(gps[piexif.GPSIFD.GPSLatitude], gps[piexif.GPSIFD.GPSLatitudeRef]);
  if (lat !== null) values['GPSLatitude'] = String(Number(lat.toFixed(6)));
  const lon = dmsToDeg(gps[piexif.GPSIFD.GPSLongitude], gps[piexif.GPSIFD.GPSLongitudeRef]);
  if (lon !== null) values['GPSLongitude'] = String(Number(lon.toFixed(6)));
  const alt = fromRational(gps[piexif.GPSIFD.GPSAltitude]);
  if (alt !== null) values['GPSAltitude'] = String(alt);

  return { dataUrl, values, supported: true };
}

// ---------------------------------------------------------------------------
// Write a values map back into the JPEG as a new data URL
// ---------------------------------------------------------------------------

function toExifDateTime(input: string): string | null {
  if (!input) return null;
  // input from <input type="datetime-local"> is "YYYY-MM-DDTHH:mm"
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${y}:${mo}:${d} ${h}:${mi}:00`;
}

function parseShutterSpeed(input: string): [number, number] | null {
  const s = input.trim();
  if (!s) return null;
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    if (!n || !d) return null;
    return [n, d];
  }
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return toRational(n, 10000);
}

// Every managed field, and the raw EXIF/GPS tag id(s) it owns. Used so a
// write only ever touches tags the form actually exposes — every other tag
// already present in the image (thumbnails, vendor maker notes, comments,
// unmanaged fields, etc.) is preserved untouched.
const MANAGED_ZEROTH_TAGS = [
  piexif.ImageIFD.Make, piexif.ImageIFD.Model, piexif.ImageIFD.Software,
  piexif.ImageIFD.Artist, piexif.ImageIFD.Copyright, piexif.ImageIFD.ImageDescription,
  piexif.ImageIFD.Orientation, piexif.ImageIFD.DateTime,
];
const MANAGED_EXIF_TAGS = [
  piexif.ExifIFD.LensMake, piexif.ExifIFD.LensModel, piexif.ExifIFD.DateTimeOriginal,
  piexif.ExifIFD.DateTimeDigitized, piexif.ExifIFD.ExposureTime, piexif.ExifIFD.FNumber,
  piexif.ExifIFD.ISOSpeedRatings, piexif.ExifIFD.ExposureBiasValue, piexif.ExifIFD.FocalLength,
  piexif.ExifIFD.FocalLengthIn35mmFilm, piexif.ExifIFD.ExposureProgram, piexif.ExifIFD.MeteringMode,
  piexif.ExifIFD.WhiteBalance, piexif.ExifIFD.Flash,
];
const MANAGED_GPS_TAGS = [
  piexif.GPSIFD.GPSLatitudeRef, piexif.GPSIFD.GPSLatitude,
  piexif.GPSIFD.GPSLongitudeRef, piexif.GPSIFD.GPSLongitude,
  piexif.GPSIFD.GPSAltitudeRef, piexif.GPSIFD.GPSAltitude,
];

export function writeImage(dataUrl: string, values: MetadataValues): string {
  let exifObj: piexif.ExifDict;
  try {
    exifObj = piexif.load(dataUrl);
  } catch {
    exifObj = { '0th': {}, Exif: {}, GPS: {}, '1st': {}, Interop: {}, thumbnail: null } as unknown as piexif.ExifDict;
  }

  // Start from whatever was already in the image so unmanaged tags survive,
  // then strip only the tags this form owns — they get re-added below from
  // the current form values (or stay removed if the user cleared them).
  const zeroth: Record<number, unknown> = { ...(exifObj['0th'] ?? {}) };
  const exif: Record<number, unknown> = { ...(exifObj['Exif'] ?? {}) };
  const gps: Record<number, unknown> = { ...(exifObj['GPS'] ?? {}) };
  for (const tag of MANAGED_ZEROTH_TAGS) delete zeroth[tag];
  for (const tag of MANAGED_EXIF_TAGS) delete exif[tag];
  for (const tag of MANAGED_GPS_TAGS) delete gps[tag];

  const str = (v?: string) => (v !== undefined && v !== '' ? v : undefined);
  const num = (v?: string): number | undefined => {
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  if (str(values.Make) !== undefined) zeroth[piexif.ImageIFD.Make] = sanitizeExifString(values.Make!);
  if (str(values.Model) !== undefined) zeroth[piexif.ImageIFD.Model] = sanitizeExifString(values.Model!);
  if (str(values.Software) !== undefined) zeroth[piexif.ImageIFD.Software] = sanitizeExifString(values.Software!);
  if (str(values.Artist) !== undefined) zeroth[piexif.ImageIFD.Artist] = sanitizeExifString(values.Artist!);
  if (str(values.Copyright) !== undefined) zeroth[piexif.ImageIFD.Copyright] = sanitizeExifString(values.Copyright!);
  // JPEG/EXIF has no dedicated place-name tag, so a location name is folded
  // into the free-text description rather than dropped. Joined with a plain
  // ascii hyphen (not an em dash) — see sanitizeExifString above for why.
  const description = [str(values.ImageDescription), str(values.GPSLocationName) ? `Location: ${values.GPSLocationName}` : undefined]
    .filter(Boolean)
    .join(' - ');
  if (description) zeroth[piexif.ImageIFD.ImageDescription] = sanitizeExifString(description);
  const orientation = num(values.Orientation);
  if (orientation !== undefined) zeroth[piexif.ImageIFD.Orientation] = orientation;
  const dt = toExifDateTime(values.DateTime ?? '');
  if (dt) zeroth[piexif.ImageIFD.DateTime] = dt;

  if (str(values.LensMake) !== undefined) exif[piexif.ExifIFD.LensMake] = sanitizeExifString(values.LensMake!);
  if (str(values.LensModel) !== undefined) exif[piexif.ExifIFD.LensModel] = sanitizeExifString(values.LensModel!);
  const dtOrig = toExifDateTime(values.DateTimeOriginal ?? '');
  if (dtOrig) exif[piexif.ExifIFD.DateTimeOriginal] = dtOrig;
  const dtDig = toExifDateTime(values.DateTimeDigitized ?? '');
  if (dtDig) exif[piexif.ExifIFD.DateTimeDigitized] = dtDig;

  const shutter = values.ExposureTime ? parseShutterSpeed(values.ExposureTime) : null;
  if (shutter) exif[piexif.ExifIFD.ExposureTime] = shutter;
  const fNumber = num(values.FNumber);
  if (fNumber !== undefined) exif[piexif.ExifIFD.FNumber] = toRational(fNumber, 10);
  const iso = num(values.ISOSpeedRatings);
  if (iso !== undefined) exif[piexif.ExifIFD.ISOSpeedRatings] = [iso];
  const ev = num(values.ExposureBiasValue);
  if (ev !== undefined) {
    const [n, d] = toRational(Math.abs(ev), 10);
    exif[piexif.ExifIFD.ExposureBiasValue] = [ev < 0 ? -n : n, d];
  }
  const focalLength = num(values.FocalLength);
  if (focalLength !== undefined) exif[piexif.ExifIFD.FocalLength] = toRational(focalLength, 10);
  const focal35 = num(values.FocalLengthIn35mmFilm);
  if (focal35 !== undefined) exif[piexif.ExifIFD.FocalLengthIn35mmFilm] = focal35;
  const exposureProgram = num(values.ExposureProgram);
  if (exposureProgram !== undefined) exif[piexif.ExifIFD.ExposureProgram] = exposureProgram;
  const meteringMode = num(values.MeteringMode);
  if (meteringMode !== undefined) exif[piexif.ExifIFD.MeteringMode] = meteringMode;
  const whiteBalance = num(values.WhiteBalance);
  if (whiteBalance !== undefined) exif[piexif.ExifIFD.WhiteBalance] = whiteBalance;
  const flash = num(values.Flash);
  if (flash !== undefined) exif[piexif.ExifIFD.Flash] = flash;

  const lat = num(values.GPSLatitude);
  if (lat !== undefined) {
    gps[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
    gps[piexif.GPSIFD.GPSLatitude] = degToDms(lat);
  }
  const lon = num(values.GPSLongitude);
  if (lon !== undefined) {
    gps[piexif.GPSIFD.GPSLongitudeRef] = lon >= 0 ? 'E' : 'W';
    gps[piexif.GPSIFD.GPSLongitude] = degToDms(lon);
  }
  const alt = num(values.GPSAltitude);
  if (alt !== undefined) {
    gps[piexif.GPSIFD.GPSAltitudeRef] = alt < 0 ? 1 : 0;
    gps[piexif.GPSIFD.GPSAltitude] = toRational(Math.abs(alt), 10);
  }

  // Preserve the original thumbnail and 1st-IFD (thumbnail metadata) rather
  // than discarding them — they are not managed by this form.
  const newExif = {
    '0th': zeroth,
    Exif: exif,
    GPS: gps,
    '1st': exifObj['1st'] ?? {},
    Interop: exifObj['Interop'] ?? {},
    thumbnail: exifObj['thumbnail'] ?? null,
  } as unknown as piexif.ExifDict;
  const exifBytes = piexif.dump(newExif);
  try {
    return piexif.insert(exifBytes, dataUrl);
  } catch {
    throw new Error('Could not save metadata into this file. Try again, or use "Strip All Metadata" instead.');
  }
}

// Strip every EXIF/GPS/IPTC tag from the image entirely.
export function stripImage(dataUrl: string): string {
  try {
    return piexif.remove(dataUrl);
  } catch {
    return dataUrl;
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
