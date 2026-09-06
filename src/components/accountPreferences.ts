/**
 * NEMO — learning preferences.
 *
 * Kept out of the dialog module so the component files export only components,
 * which is what keeps fast refresh working during development.
 */

export interface LearningPreferences {
  level: 'beginner' | 'intermediate' | 'advanced';
  depth: 'concise' | 'detailed';
  style: 'visual-first' | 'code-first' | 'balanced';
}

export const DEFAULT_PREFERENCES: LearningPreferences = {
  level: 'intermediate',
  depth: 'detailed',
  style: 'visual-first',
};

/** Appearance applies to the whole application, never to one page. */
export type Appearance = 'dark' | 'light' | 'system';
