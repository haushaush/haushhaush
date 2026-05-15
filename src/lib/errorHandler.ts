/**
 * Global error handler that suppresses cross-origin iframe errors.
 * Cross-origin iframes (e.g. embedded customer websites in the showcase)
 * surface as "Script error." with no filename/lineno — they are not our bugs.
 */
export function setupGlobalErrorHandler() {
  window.addEventListener(
    'error',
    (event) => {
      const isCrossOriginIframeError =
        event.message === 'Script error.' ||
        event.message === 'Script error' ||
        (!event.filename && !event.lineno && !event.colno);

      if (isCrossOriginIframeError) {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.debug('[Suppressed iframe error]', event.message);
        return false;
      }

      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'IFRAME') {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.debug('[Suppressed iframe resource error]', target);
        return false;
      }
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event.reason;
    const message = typeof reason === 'string' ? reason : reason?.message || '';

    if (
      message === 'Script error.' ||
      message.includes('cross-origin') ||
      message.includes('SecurityError')
    ) {
      event.preventDefault();
      console.debug('[Suppressed cross-origin promise error]', message);
      return false;
    }
  });
}
