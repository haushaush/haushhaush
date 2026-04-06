import { ARIAButton } from './ARIAButton';
import { ARIAGlow } from './ARIAGlow';
import { ARIAPanel } from './ARIAPanel';

export function ARIASystem() {
  return (
    <>
      <ARIAGlow />
      <ARIAPanel />
      <ARIAButton />
    </>
  );
}
