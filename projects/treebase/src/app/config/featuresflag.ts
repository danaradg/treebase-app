export const FeatureFlags = {
  EnableAuth: true,
  EnableProposalApproval: true
} as const;

export type FeatureFlagKey = keyof typeof FeatureFlags;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FeatureFlags[flag] ?? false;
}
