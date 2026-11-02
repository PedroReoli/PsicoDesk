import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'admin', 'psychologist', 'receptionist', 'finance']);
export const userStatusSchema = z.enum(['active', 'inactive', 'locked']);
export const patientStatusSchema = z.enum(['active', 'inactive', 'archived']);
export const appointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
]);
export const appointmentKindSchema = z.enum([
  'individual',
  'couple',
  'family',
  'group',
  'assessment',
]);
export const chargeStatusSchema = z.enum(['pending', 'paid', 'overdue', 'cancelled']);
export const paymentMethodSchema = z.enum(['cash', 'pix', 'card', 'transfer', 'other']);
export const documentTypeSchema = z.enum(['declaration', 'receipt', 'report', 'consent', 'other']);

const idSchema = z.uuid();
const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const userSummarySchema = z.object({
  id: idSchema,
  displayName: z.string().min(2).max(120),
  username: z.string().min(3).max(80),
  role: roleSchema,
  professionalRegistration: z.string().nullable().optional(),
  status: userStatusSchema,
  createdAt: isoDateTimeSchema,
});

export const sessionSchema = z.object({
  token: z.string().length(64),
  expiresAt: isoDateTimeSchema,
  user: userSummarySchema,
});
export const bootstrapAdminInputSchema = z.object({
  displayName: z.string().min(2).max(120),
  username: z.string().min(3).max(80),
  password: z.string().min(12).max(128),
});
export const loginInputSchema = z.object({
  username: z.string().min(3).max(80),
  password: z.string().min(1).max(128),
});
export const createUserInputSchema = bootstrapAdminInputSchema.extend({
  role: roleSchema.exclude(['owner']),
  professionalRegistration: z.string().max(80).nullable().optional(),
});

export const patientSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  socialName: z.string().nullable().optional(),
  birthDate: isoDateSchema.nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  guardianName: z.string().nullable().optional(),
  guardianPhone: z.string().nullable().optional(),
  status: patientStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  version: z.number().int().positive(),
});
export const createPatientInputSchema = z.object({
  fullName: z.string().min(2).max(160),
  socialName: z.string().max(160).nullable().optional(),
  birthDate: isoDateSchema.nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  guardianName: z.string().max(160).nullable().optional(),
  guardianPhone: z.string().max(40).nullable().optional(),
  professionalId: idSchema.nullable().optional(),
});
export const updatePatientInputSchema = createPatientInputSchema
  .omit({ professionalId: true })
  .extend({ status: patientStatusSchema, version: z.number().int().positive() });

export const appointmentSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  patientName: z.string(),
  professionalId: idSchema,
  professionalName: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  status: appointmentStatusSchema,
  kind: appointmentKindSchema,
  recurrenceId: idSchema.nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  version: z.number().int().positive(),
});
export const createAppointmentInputSchema = z.object({
  patientId: idSchema,
  professionalId: idSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  kind: appointmentKindSchema,
  recurrenceId: idSchema.nullable().optional(),
});
export const updateAppointmentStatusInputSchema = z.object({
  status: appointmentStatusSchema,
  cancellationReason: z.string().max(500).nullable().optional(),
  version: z.number().int().positive(),
});

export const clinicalRecordSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  authorId: idSchema,
  authorName: z.string(),
  appointmentId: idSchema.nullable().optional(),
  body: z.string(),
  amendmentOf: idSchema.nullable().optional(),
  contentHash: z.string().startsWith('sha256:'),
  createdAt: isoDateTimeSchema,
});
export const createClinicalRecordInputSchema = z.object({
  patientId: idSchema,
  appointmentId: idSchema.nullable().optional(),
  body: z.string().min(3).max(100_000),
});

export const chargeSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  patientName: z.string(),
  description: z.string(),
  amountMinor: z.number().int().positive(),
  paidMinor: z.number().int().nonnegative(),
  dueDate: isoDateSchema,
  status: chargeStatusSchema,
  createdAt: isoDateTimeSchema,
});
export const createChargeInputSchema = z.object({
  patientId: idSchema,
  description: z.string().min(2).max(240),
  amountMinor: z.number().int().positive(),
  dueDate: isoDateSchema,
});
export const paymentSchema = z.object({
  id: idSchema,
  chargeId: idSchema,
  amountMinor: z.number().int().positive(),
  method: paymentMethodSchema,
  paidAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export const registerPaymentInputSchema = z.object({
  amountMinor: z.number().int().positive(),
  method: paymentMethodSchema,
  paidAt: isoDateTimeSchema,
});

export const documentSchema = z.object({
  id: idSchema,
  patientId: idSchema.nullable().optional(),
  patientName: z.string().nullable().optional(),
  title: z.string(),
  documentType: documentTypeSchema,
  templateVersion: z.number().int().positive(),
  encryptedPath: z.string(),
  checksum: z.string().startsWith('sha256:'),
  createdAt: isoDateTimeSchema,
});
export const generateDocumentInputSchema = z.object({
  patientId: idSchema.nullable().optional(),
  title: z.string().min(2).max(200),
  documentType: documentTypeSchema,
  content: z.string().min(1).max(1_000_000),
  templateVersion: z.number().int().positive(),
});

export const dashboardReportSchema = z.object({
  sessionsThisMonth: z.number().int().nonnegative(),
  activePatients: z.number().int().nonnegative(),
  revenueThisMonthMinor: z.number().int().nonnegative(),
  occupancyPercent: z.number().int().min(0).max(100),
  pendingAmountMinor: z.number().int().nonnegative(),
  appointmentsToday: z.array(appointmentSchema),
});
export const appSettingSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  updatedAt: isoDateTimeSchema,
});
export const backupInfoSchema = z.object({
  id: z.string().regex(/^backup-\d{8}T\d{6}Z\.db$/),
  createdAt: isoDateTimeSchema,
  sizeBytes: z.number().int().nonnegative(),
});
export const commandErrorSchema = z.object({ code: z.string(), message: z.string() });
