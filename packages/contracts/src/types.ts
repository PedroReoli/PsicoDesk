import type { z } from "zod";
import type {
  appSettingSchema, appointmentSchema, backupInfoSchema, chargeSchema, clinicalRecordSchema, commandErrorSchema,
  dashboardReportSchema, documentSchema, patientSchema, paymentSchema, roleSchema, sessionSchema, userSummarySchema,
} from "./schemas.js";

export type Role = z.infer<typeof roleSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type ClinicalRecord = z.infer<typeof clinicalRecordSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Document = z.infer<typeof documentSchema>;
export type DashboardReport = z.infer<typeof dashboardReportSchema>;
export type AppSetting = z.infer<typeof appSettingSchema>;
export type BackupInfo = z.infer<typeof backupInfoSchema>;
export type CommandError = z.infer<typeof commandErrorSchema>;

