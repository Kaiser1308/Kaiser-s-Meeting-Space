export interface BrandPresetV1 {
  readonly version: 1;
  readonly id: string;
  readonly ownerId: string;
  readonly brandVersion: number;
  readonly colors: readonly string[];
  readonly fonts: readonly string[];
  readonly header: string;
  readonly footer: string;
  readonly paper: 'a4' | 'letter';
  readonly logoAssetHash: string | null;
}
export interface ExportManifestV1 {
  readonly version: 1;
  readonly ownerId: string;
  readonly meetingId: string;
  readonly projectionVersion: number;
  readonly minutesVersion: number;
  readonly templateVersion: string;
  readonly brandVersion: number;
  readonly locale: 'vi' | 'en';
  readonly timezone: string;
  readonly rendererVersion: string;
  readonly configVersion: string;
  readonly fontVersion: string;
  readonly format: 'md' | 'txt' | 'json' | 'audio' | 'docx' | 'pdf';
  readonly options: Readonly<Record<string, string | number | boolean>>;
  readonly inputHash: string;
}
const hex64 = /^[0-9a-f]{64}$/i;
const safeText = (value: string) => !/[<>]|javascript:|https?:\/\//i.test(value);
export function validateBrandPreset(
  value: unknown,
): { ok: true; value: BrandPresetV1 } | { ok: false; reason: string } {
  const brand = value as Partial<BrandPresetV1>;
  if (
    brand.version !== 1 ||
    typeof brand.id !== 'string' ||
    typeof brand.ownerId !== 'string' ||
    typeof brand.brandVersion !== 'number' ||
    !Array.isArray(brand.colors) ||
    !Array.isArray(brand.fonts) ||
    !safeText(brand.header ?? '') ||
    !safeText(brand.footer ?? '') ||
    !['a4', 'letter'].includes(brand.paper ?? '')
  )
    return { ok: false, reason: 'invalid brand preset' };
  if (
    brand.colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color)) ||
    brand.fonts.some((font) => !['Inter', 'Noto Sans', 'Arial'].includes(font))
  )
    return { ok: false, reason: 'brand asset is not allowlisted' };
  if (brand.logoAssetHash !== null && (!brand.logoAssetHash || !hex64.test(brand.logoAssetHash)))
    return { ok: false, reason: 'invalid logo hash' };
  return { ok: true, value: brand as BrandPresetV1 };
}
export function canonicalExportManifest(manifest: Omit<ExportManifestV1, 'inputHash'>): string {
  return JSON.stringify({
    ...manifest,
    options: Object.fromEntries(
      Object.entries(manifest.options).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
}
export async function createExportManifest(
  manifest: Omit<ExportManifestV1, 'inputHash'>,
): Promise<ExportManifestV1> {
  const bytes = new TextEncoder().encode(canonicalExportManifest(manifest));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const inputHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { ...manifest, inputHash };
}
