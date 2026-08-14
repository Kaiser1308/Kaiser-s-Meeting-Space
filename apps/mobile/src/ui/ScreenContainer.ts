import type { ReactNode } from 'react';

export interface ScreenContainerProps {
  readonly children: ReactNode;
}

/** Minimal screen container; the full themed shell lives in the mobile app shell. */
export function ScreenContainer({ children }: ScreenContainerProps): ReactNode {
  return children;
}
