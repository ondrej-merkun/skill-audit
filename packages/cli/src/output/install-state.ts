import type { Skill } from '../types.js';

export type InstallState = NonNullable<Skill['installState']>;

export function installStateLabel(state: Skill['installState']): InstallState {
  return state ?? 'installed';
}
