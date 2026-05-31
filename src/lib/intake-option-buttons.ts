const BUTTON_FIELD_IDS = new Set([
  'intakeRoute',
  'priority',
  'clientsAffected',
  'memberSentiment',
  'prospectQuality',
  'followUpPreference',
  'hvacSymptom',
  'machineSymptom',
  'lockFaultType',
  'accessStatus',
  'securityRisk',
  'plumbingSymptom',
  'electricalSymptom',
  'appIssueSurface',
]);

export function shouldUseOptionButtons({ id, optionCount }: { id: string; optionCount: number }): boolean {
  if (optionCount <= 0 || optionCount > 8) return false;
  return BUTTON_FIELD_IDS.has(id);
}
