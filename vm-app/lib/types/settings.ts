/** Settings page tab identifiers. */
export type SettingsTab = "appearance" | "security" | "account" | "notifications";

/** Persisted notification preference flags (GET/PUT /auth/preferences). */
export interface NotificationPreferences {
  emailOnCritical: boolean;
  emailOnScanComplete: boolean;
  emailOnSlaBreach: boolean;
}
