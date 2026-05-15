import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  message = 'Du hast ungespeicherte Änderungen. Wirklich verlassen?'
) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const confirmed = window.confirm(message);
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker, message]);
}
