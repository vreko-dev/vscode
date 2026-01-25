/**
 * ErrorBoundary component for the webview
 *
 * Catches React errors and displays a user-friendly error message
 * instead of crashing the entire webview.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	children: ReactNode;
	/** Optional fallback render function */
	fallback?: (error: Error, resetError: () => void) => ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		};
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return {
			hasError: true,
			error,
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
		this.setState({
			error,
			errorInfo,
		});
	}

	resetError = (): void => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		});
	};

	render(): ReactNode {
		if (this.state.hasError) {
			// Custom fallback if provided
			if (this.props.fallback && this.state.error) {
				return this.props.fallback(this.state.error, this.resetError);
			}

			// Default error UI
			return (
				<div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-100 p-6">
					<div className="max-w-md text-center">
						<div className="text-4xl mb-4">⚠️</div>
						<h1 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h1>
						<p className="text-zinc-400 mb-4">
							The dashboard encountered an error. This has been logged for debugging.
						</p>
						{this.state.error && (
							<div className="bg-zinc-900 border border-zinc-800 rounded p-3 mb-4 text-left">
								<p className="text-xs text-zinc-500 mb-1">Error details:</p>
								<p className="text-sm text-red-300 font-mono break-all">{this.state.error.message}</p>
							</div>
						)}
						<button
							type="button"
							onClick={this.resetError}
							className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
						>
							Try Again
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

export default ErrorBoundary;
