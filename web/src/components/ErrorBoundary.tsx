import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a blank page.
 *
 * A thrown render is the one failure the rest of the error handling cannot
 * catch: no toast fires, no state updates, React simply unmounts the tree. This
 * shows a recoverable message instead, and keeps the details visible in the
 * console for whoever is debugging.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render failed:', error, info.componentStack);
  }

  private readonly reset = () => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle size={28} />
        </div>

        <h1 className="mt-5 text-xl font-semibold">Something went wrong.</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          This part of the page failed to load. Your files were not affected.
        </p>

        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <Button icon={<RotateCcw size={16} />} onClick={this.reset}>
            Try again
          </Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Back to home
          </Button>
        </div>

        {import.meta.env.DEV && (
          <pre className="mt-8 max-w-full overflow-x-auto rounded-xl border border-line bg-surface p-4 text-left text-xs text-danger">
            {error.stack ?? error.message}
          </pre>
        )}
      </div>
    );
  }
}
