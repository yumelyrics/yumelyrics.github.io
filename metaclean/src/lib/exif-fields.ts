// Comprehensive list of editable EXIF metadata fields, grouped by category.
// Every field here maps directly to a real EXIF/GPS tag written via piexifjs.

export type FieldKind = 'text' | 'number' | 'select' | 'datetime';

export interface FieldDef {
  key: string; // internal form key
  label: string;
  kind: FieldKind;
  group: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  helper?: string;
}

export const FIELD_GROUPS = [
  'Camera & Lens',
  'Exposure Settings',
  'Date & Time',
  'Location (GPS)',
  'Author & Description',
] as const;

export const FIELDS: FieldDef[] = [
  // Camera & Lens
  { key: 'Make', label: 'Camera Make', kind: 'text', group: 'Camera & Lens', placeholder: 'e.g. Canon' },
  { key: 'Model', label: 'Camera Model', kind: 'text', group: 'Camera & Lens', placeholder: 'e.g. EOS R5' },
  { key: 'LensMake', label: 'Lens Make', kind: 'text', group: 'Camera & Lens', placeholder: 'e.g. Canon' },
  { key: 'LensModel', label: 'Lens Model', kind: 'text', group: 'Camera & Lens', placeholder: 'e.g. RF 24-70mm F2.8L IS USM' },
  { key: 'Software', label: 'Software', kind: 'text', group: 'Camera & Lens', placeholder: 'e.g. Adobe Lightroom' },

  // Exposure
  { key: 'ExposureTime', label: 'Shutter Speed', kind: 'text', group: 'Exposure Settings', placeholder: 'e.g. 1/250' },
  { key: 'FNumber', label: 'Aperture (f/)', kind: 'number', group: 'Exposure Settings', placeholder: 'e.g. 2.8' },
  { key: 'ISOSpeedRatings', label: 'ISO', kind: 'number', group: 'Exposure Settings', placeholder: 'e.g. 400' },
  { key: 'ExposureBiasValue', label: 'Exposure Compensation (EV)', kind: 'number', group: 'Exposure Settings', placeholder: 'e.g. -0.3' },
  { key: 'FocalLength', label: 'Focal Length (mm)', kind: 'number', group: 'Exposure Settings', placeholder: 'e.g. 50' },
  { key: 'FocalLengthIn35mmFilm', label: 'Focal Length (35mm equiv.)', kind: 'number', group: 'Exposure Settings', placeholder: 'e.g. 75' },
  {
    key: 'ExposureProgram', label: 'Exposure Program', kind: 'select', group: 'Exposure Settings',
    options: [
      { value: '0', label: 'Not Defined' }, { value: '1', label: 'Manual' }, { value: '2', label: 'Program AE' },
      { value: '3', label: 'Aperture Priority' }, { value: '4', label: 'Shutter Priority' },
      { value: '5', label: 'Creative' }, { value: '6', label: 'Action' }, { value: '7', label: 'Portrait' }, { value: '8', label: 'Landscape' },
    ],
  },
  {
    key: 'MeteringMode', label: 'Metering Mode', kind: 'select', group: 'Exposure Settings',
    options: [
      { value: '0', label: 'Unknown' }, { value: '1', label: 'Average' }, { value: '2', label: 'Center-weighted' },
      { value: '3', label: 'Spot' }, { value: '4', label: 'Multi-spot' }, { value: '5', label: 'Pattern / Matrix' }, { value: '6', label: 'Partial' },
    ],
  },
  {
    key: 'WhiteBalance', label: 'White Balance', kind: 'select', group: 'Exposure Settings',
    options: [{ value: '0', label: 'Auto' }, { value: '1', label: 'Manual' }],
  },
  {
    key: 'Flash', label: 'Flash', kind: 'select', group: 'Exposure Settings',
    options: [
      { value: '0', label: 'Did not fire' }, { value: '1', label: 'Fired' },
      { value: '9', label: 'Fired, compulsory' }, { value: '16', label: 'Did not fire, compulsory' }, { value: '24', label: 'Auto, did not fire' }, { value: '25', label: 'Auto, fired' },
    ],
  },
  {
    key: 'Orientation', label: 'Orientation', kind: 'select', group: 'Exposure Settings',
    options: [
      { value: '1', label: 'Normal' }, { value: '3', label: 'Rotated 180°' },
      { value: '6', label: 'Rotated 90° CW' }, { value: '8', label: 'Rotated 90° CCW' },
    ],
  },

  // Date & Time
  { key: 'DateTimeOriginal', label: 'Date Taken', kind: 'datetime', group: 'Date & Time' },
  { key: 'DateTimeDigitized', label: 'Date Digitized', kind: 'datetime', group: 'Date & Time' },
  { key: 'DateTime', label: 'Date Modified', kind: 'datetime', group: 'Date & Time' },

  // Location
  { key: 'GPSLatitude', label: 'Latitude', kind: 'number', group: 'Location (GPS)', placeholder: 'e.g. 40.7128' },
  { key: 'GPSLongitude', label: 'Longitude', kind: 'number', group: 'Location (GPS)', placeholder: 'e.g. -74.0060' },
  { key: 'GPSAltitude', label: 'Altitude (m)', kind: 'number', group: 'Location (GPS)', placeholder: 'e.g. 15' },
  { key: 'GPSLocationName', label: 'Location Name', kind: 'text', group: 'Location (GPS)', placeholder: 'e.g. Paris, France', helper: 'Written into the image description as "Location: <name>" since JPEG/EXIF has no dedicated place-name tag. Not re-read from existing files.' },

  // Author / description
  { key: 'Artist', label: 'Author / Artist', kind: 'text', group: 'Author & Description', placeholder: 'e.g. Jane Doe' },
  { key: 'Copyright', label: 'Copyright', kind: 'text', group: 'Author & Description', placeholder: 'e.g. © 2026 Jane Doe' },
  { key: 'ImageDescription', label: 'Description', kind: 'text', group: 'Author & Description', placeholder: 'e.g. Sunset over the bay' },
];

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
