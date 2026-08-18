import { z } from 'zod';

const imageUrl = z.string().url('Invalid image URL');

const sectionSchema = z
  .object({
    key: z.string().min(1, 'Section key is required'),
    type: z.string().min(1, 'Section type is required').optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    image: imageUrl.optional(),
    images: z.array(imageUrl).optional(),
    active: z.boolean().optional(),
    order: z.number().optional(),
    data: z.any().optional(),
  })
  .passthrough();

const contentSectionsSchema = z
  .object({
    sections: z.array(sectionSchema).default([]),
  })
  .passthrough();

export const SETTING_SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  'content.homepage': contentSectionsSchema,
  'content.onboarding': contentSectionsSchema,
  'content.register': contentSectionsSchema,
  'content.community': contentSectionsSchema,
  'content.track': contentSectionsSchema,
  'content.event': contentSectionsSchema,
  'content.app-screen': contentSectionsSchema,
};

export const validateSettingValue = (key: string, value: any) => {
  const schema = SETTING_SCHEMA_REGISTRY[key];
  if (!schema) {
    return { applied: false as const, value };
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return { applied: true as const, errors };
  }

  return { applied: true as const, value: result.data };
};
