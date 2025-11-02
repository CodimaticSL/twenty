import { FeatureFlagKey } from 'src/engine/core-modules/feature-flag/enums/feature-flag-key.enum';

export const DEFAULT_FEATURE_FLAGS = [
  FeatureFlagKey.IS_COMMON_API_ENABLED,
  FeatureFlagKey.IS_PAGE_LAYOUT_ENABLED,
  FeatureFlagKey.IS_APPLICATION_ENABLED,
  FeatureFlagKey.IS_CALENDAR_VIEW_ENABLED,
  FeatureFlagKey.IS_AI_ENABLED,
];
