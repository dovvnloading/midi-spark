import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-[var(--app-bg)] text-[var(--text-main)] font-sans">
          <div className="hardware-panel p-8 max-w-md flex flex-col gap-4 items-center text-center">
            <h1 className="text-lg font-bold uppercase tracking-widest">
              Something went wrong
            </h1>
            <p className="text-xs text-[var(--text-muted)] font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="hardware-btn hardware-btn-primary h-10 px-6 text-[10px] uppercase tracking-widest font-bold"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
