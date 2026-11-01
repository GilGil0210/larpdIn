import { z } from "zod";

/**
 * Shared Larpdin API contract (backend copy). The extension keeps its own
 * independent copy; neither side imports the other's source.
 */

// LinkedIn-ish field limits, used to bound input and to clamp generated output.
export const LIMITS = {
  headline: 220,
  location: 120,
  industry: 120,
  about: 2600,
  school: 200,
  degree: 200,
  fieldOfStudy: 200,
  grade: 80,
  activities: 500,
  description: 1000,
  educationEntries: 20,
  brief: 2000,
  personaName: 80,
  personaDescription: 400,
} as const;

const year = z.number().int().min(1900).max(2100).nullable();

export const EducationSchema = z.strictObject({
  school: z.string().max(LIMITS.school),
  degree: z.string().max(LIMITS.degree),
  fieldOfStudy: z.string().max(LIMITS.fieldOfStudy),
  startYear: year,
  endYear: year,
  grade: z.string().max(LIMITS.grade),
  activities: z.string().max(LIMITS.activities),
  description: z.string().max(LIMITS.description),
});

export const ProfileContentSchema = z.strictObject({
  headline: z.string().max(LIMITS.headline),
  location: z.string().max(LIMITS.location),
  industry: z.string().max(LIMITS.industry),
  about: z.string().max(LIMITS.about),
  education: z.array(EducationSchema).max(LIMITS.educationEntries),
});

export const GenerateRequestSchema = z.strictObject({
  profile: ProfileContentSchema,
  brief: z
    .string()
    .max(LIMITS.brief)
    .refine((s) => s.trim().length > 0, "brief must not be empty"),
});

export const PersonaCandidateSchema = z.strictObject({
  name: z.string().min(1).max(LIMITS.personaName),
  description: z.string().max(LIMITS.personaDescription),
  content: ProfileContentSchema,
});

export const GenerateResponseSchema = z.strictObject({
  personas: z.tuple([PersonaCandidateSchema, PersonaCandidateSchema, PersonaCandidateSchema]),
});

export type Education = z.infer<typeof EducationSchema>;
export type ProfileContent = z.infer<typeof ProfileContentSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type PersonaCandidate = z.infer<typeof PersonaCandidateSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

export type ErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "GENERATION_FAILED"
  | "UPSTREAM_TIMEOUT"
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ErrorBody = { error: { code: ErrorCode; message: string } };
