import { z } from "zod";

// ---- Permission scope ----
export const PermissionScopeSchema = z
  .object({
    groupIds: z.array(z.string().cuid()).optional(),
    moduleIds: z.array(z.string().cuid()).optional(),
  })
  .strict();

export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

// ---- Quiz options ----
export const QuizOptionSchema = z
  .array(
    z.object({
      id: z.string(),
      text: z.string().min(1),
      isCorrect: z.boolean(),
    })
  )
  .min(2)
  .refine((opts) => opts.some((o) => o.isCorrect), "Vsaj ena opcija mora biti pravilna");

export type QuizOption = z.infer<typeof QuizOptionSchema>[number];

// ---- Quiz answers ----
export const QuizAnswerSchema = z.array(
  z.object({
    questionId: z.string(),
    selectedOptions: z.array(z.string()),
    correct: z.boolean(),
  })
);

export type QuizAnswer = z.infer<typeof QuizAnswerSchema>[number];

// ---- Self assessment ----
export const SelfAssessmentSchema = z.object({
  rating: z.number().int().min(1).max(5),
  note: z.string().max(1000).optional(),
});

// ---- Module feedback (post-completion rating + suggestion) ----
export const ModuleFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  suggestion: z.string().min(20, "Predlog mora vsebovati vsaj 20 znakov").max(500),
});

// ---- User forms ----
export const LoginSchema = z.object({
  email: z.string().email("Neveljaven email"),
  password: z.string().min(1, "Geslo je obvezno"),
});

export const CreateUserSchema = z.object({
  email: z.string().email("Neveljaven email"),
  password: z.string().min(8, "Geslo mora imeti vsaj 8 znakov"),
  firstName: z.string().min(1, "Ime je obvezno"),
  lastName: z.string().min(1, "Priimek je obvezen"),
  role: z.enum(["OWNER", "SUPER_ADMIN", "ADMIN", "EMPLOYEE"]),
  tenantRole: z.enum(["SUPER_ADMIN", "ADMIN", "HR", "EMPLOYEE", "VIEWER"]).optional(),
});

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["OWNER", "SUPER_ADMIN", "ADMIN", "EMPLOYEE"]).optional(),
  isActive: z.boolean().optional(),
});

// ---- Module forms ----
export const CreateModuleSchema = z.object({
  title: z.string().min(1, "Naslov je obvezen"),
  description: z.string().min(1, "Opis je obvezen"),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("BEGINNER"),
  estimatedTime: z.number().int().positive().optional(),
  isMandatory: z.boolean().default(false),
  categoryId: z.string().cuid().nullable().optional(),
});

// ---- Category forms ----
export const CreateCategorySchema = z.object({
  name: z.string().min(1, "Ime področja je obvezno"),
  sortOrder: z.number().int().min(0).default(0),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const ReorderCategoriesSchema = z.array(z.string().cuid());

export const UpdateModuleSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  estimatedTime: z.number().int().positive().nullable().optional(),
  isMandatory: z.boolean().optional(),
  coverImage: z.string().nullable().optional(),
  categoryId: z.string().cuid().nullable().optional(),
});

// ---- Section forms ----
export const CreateSectionSchema = z.object({
  title: z.string().min(1, "Naslov je obvezen"),
  content: z.string().default(""),
  type: z.enum(["TEXT", "VIDEO", "ATTACHMENT", "MIXED"]).default("TEXT"),
  unlockAfterSectionId: z.string().cuid().nullable().optional(),
});

export const UpdateSectionSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  type: z.enum(["TEXT", "VIDEO", "ATTACHMENT", "MIXED"]).optional(),
  sortOrder: z.number().int().min(0).optional(),
  unlockAfterSectionId: z.string().cuid().nullable().optional(),
  videoSourceType: z.enum(["YOUTUBE_VIMEO_URL", "UPLOAD"]).optional(),
});

// ---- Group forms ----
export const CreateGroupSchema = z.object({
  name: z.string().min(1, "Ime skupine je obvezno"),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const UpdateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

// ---- Comment ----
export const CreateCommentSchema = z.object({
  content: z.string().min(1, "Komentar ne sme biti prazen"),
  parentId: z.string().cuid().nullable().optional(),
});

// Logo URL: accept internal /api/logos/... paths or full https URLs
const logoUrlSchema = z.string().refine(
  (val) => val.startsWith("/api/logos/") || /^https?:\/\//.test(val),
  "Neveljaven URL logotipa"
);

// ---- Tenant forms ----
export const CreateTenantSchema = z.object({
  name: z.string().min(1, "Ime podjetja je obvezno"),
  slug: z
    .string()
    .min(1, "URL oznaka je obvezna")
    .regex(/^[a-z0-9-]+$/, "Slug sme vsebovati le male črke, številke in vezaje"),
  logoUrl: logoUrlSchema.optional(),
  theme: z.enum(["DEFAULT", "OCEAN", "SUNSET"]).default("DEFAULT"),
  // Initial Super Admin
  adminEmail: z.string().email("Neveljaven email"),
  adminPassword: z.string().min(8, "Geslo mora imeti vsaj 8 znakov"),
  adminFirstName: z.string().min(1, "Ime je obvezno"),
  adminLastName: z.string().min(1, "Priimek je obvezen"),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug sme vsebovati le male črke, številke in vezaje")
    .optional(),
  logoUrl: logoUrlSchema.nullable().optional(),
  theme: z.enum(["DEFAULT", "OCEAN", "SUNSET"]).optional(),
  locale: z.enum(["en", "sl"]).optional(),
});

export const CreateMembershipSchema = z.object({
  userId: z.string(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "HR", "EMPLOYEE", "VIEWER"]),
});

export const UpdateMembershipSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "HR", "EMPLOYEE", "VIEWER"]),
});

// ---- Upload MIME whitelist ----
export const MIME_WHITELIST: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
};

export function isAllowedMime(mimeType: string): boolean {
  return mimeType in MIME_WHITELIST;
}

export function isAllowedExtension(filename: string, mimeType: string): boolean {
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  const allowed = MIME_WHITELIST[mimeType];
  return allowed ? allowed.includes(ext) : false;
}
