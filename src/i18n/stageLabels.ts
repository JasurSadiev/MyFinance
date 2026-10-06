import type { AllocationStage } from '../types/finance';
import type { TranslationKey } from './LanguageContext';

/**
 * Translation key for every allocation stage.
 * Typed as a complete Record so adding a new AllocationStage without a label fails the build.
 */
export const STAGE_LABEL_KEYS: Record<AllocationStage, TranslationKey> = {
  percentage: 'stage_percentage',
  need_full: 'stage_need_full',
  need_proportional: 'stage_need_proportional',
  surplus: 'stage_surplus',
  working_capital: 'stage_working_capital',
  manual_override: 'stage_manual_override',
  manual_deposit: 'stage_manual_deposit',
};
