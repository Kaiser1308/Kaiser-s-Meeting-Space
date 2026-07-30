import { z } from 'zod';

export const ModelManifestEntrySchema = z
  .object({
    modelId: z.string().min(1).max(128),
    language: z.enum(['vi', 'en']),
    engineType: z.literal('whisper_cpp_compat'),
    path: z
      .string()
      .regex(/^[A-Za-z0-9_./-]+$/, 'path must contain only safe filename characters')
      .refine((p) => !p.includes('..'), {
        message: 'path must not contain parent-directory traversal',
      })
      .refine((p) => !p.startsWith('/'), { message: 'path must be relative to storage root' })
      .refine((p) => !p.includes(':'), {
        message: 'path must not contain drive-letter separators',
      }),
    sha256: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]{64}$/),
    maxConcurrentStreams: z.number().int().positive().max(8),
    licenseProvenance: z
      .object({
        license: z.string().min(1).max(256),
        reviewedBy: z.string().min(1).max(128),
        reviewedAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

export type ModelManifestEntry = z.infer<typeof ModelManifestEntrySchema>;

export const ModelManifestSchema = z
  .object({
    version: z.literal(1),
    models: z.array(ModelManifestEntrySchema).min(1),
  })
  .strict();

export type ModelManifest = z.infer<typeof ModelManifestSchema>;
