export enum FeatureFlag {
  EnableAuth = 'EnableAuth',
  EnableProposalApproval = 'EnableProposalApproval'
}

export const FeatureFlags: Record<FeatureFlag, boolean> = {
  [FeatureFlag.EnableAuth]: true,
  [FeatureFlag.EnableProposalApproval]: true
};

export function isFeatureEnabled(flag: FeatureFlag | keyof typeof FeatureFlag | string): boolean {
  const flagKey = flag as FeatureFlag;
  return FeatureFlags[flagKey] ?? false;
}
