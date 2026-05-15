import React from 'react';
import { Globe } from 'lucide-react';

interface State {
  hasError: boolean;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Error boundary specifically for iframe embeds. Suppresses cross-origin
 * "Script error." noise without taking down the surrounding page.
 */
export class IframeErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    if (
      error?.message === 'Script error.' ||
      error?.message?.includes('cross-origin')
    ) {
      console.debug('[IframeErrorBoundary] cross-origin error suppressed');
      return { hasError: false };
    }
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.debug('[IframeErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg border border-border">
            <div className="text-center p-6">
              <Globe className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Vorschau nicht verfügbar</p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
