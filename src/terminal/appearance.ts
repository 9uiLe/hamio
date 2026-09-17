/** Display policy is a value; renderers never read process environment or terminals. */
export interface Appearance {
  readonly color: boolean;
  readonly width: number;
  readonly live: boolean;
}
