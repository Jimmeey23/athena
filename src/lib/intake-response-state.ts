interface MoreInfoState {
  hasDetailForm: boolean;
  remainingMissingFieldCount: number;
  aiNeedsMoreInfo?: boolean;
}

interface AiDetailFormState {
  remainingMissingFieldCount: number;
}

const GENERIC_CATEGORIES = new Set(['', 'General Feedback', 'Miscellaneous']);

export function shouldHoldDraftForMoreInfo(state: MoreInfoState): boolean {
  return state.hasDetailForm || state.remainingMissingFieldCount > 0;
}

export function shouldAcceptAiDetailForm(state: AiDetailFormState): boolean {
  return state.remainingMissingFieldCount > 0;
}

export function shouldReplaceInferredCategory(currentCategory?: string, inferredCategory?: string): boolean {
  if (!inferredCategory || inferredCategory === currentCategory) return false;
  return GENERIC_CATEGORIES.has(currentCategory || '');
}

export function shouldAcceptInferredSubCategory(
  currentCategory: string | undefined,
  inferredSubCategory: string | undefined,
  validSubCategories: string[] | undefined
): boolean {
  if (!inferredSubCategory || !currentCategory || !validSubCategories) return true;
  return validSubCategories.includes(inferredSubCategory);
}
