/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

import { useState } from "preact/hooks";

interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const handleCreateToken = () => {
    // Open GitHub token creation page with correct scopes
    window.open(
      "https://github.com/settings/tokens/new?description=Zenhub%20Notifications&scopes=notifications,repo,read:org",
      "_blank"
    );
    setShowTokenInput(true);
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError("Please enter a valid GitHub token");
      return;
    }

    setIsValidating(true);
    setError("");

    try {
      // Validate token by making a test API call
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${trimmedToken}`,
        },
      });

      if (response.ok) {
        onLogin(trimmedToken);
      } else {
        setError("Invalid token. Please check your token and try again.");
      }
    } catch (err) {
      setError("Failed to validate token. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-black/80 border-2 border-cyan-500 p-8 max-w-md w-full">
        <h1 className="text-4xl font-bold mb-8 text-center vhs-text vhs-glitch">
          ZENHUB LOGIN
        </h1>

        <div className="mb-8 text-center">
          <div className="inline-block p-4 mb-4">
            <svg
              className="w-16 h-16 text-cyan-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </div>
          <p className="vhs-text text-xl">GITHUB NOTIFICATIONS</p>
        </div>

        {!showTokenInput ? (
          <button
            onClick={handleCreateToken}
            className="w-full vhs-button py-4 px-6 font-bold vhs-transition"
          >
            [CREATE GITHUB TOKEN]
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-cyan-500 mb-2">
                PASTE YOUR GITHUB TOKEN:
              </label>
              <input
                id="token"
                type="password"
                value={token}
                onInput={(e) => setToken((e.target as HTMLInputElement).value)}
                className="w-full px-4 py-3 bg-black border-2 border-cyan-500 text-cyan-500 font-mono focus:border-magenta-500 focus:outline-none"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                disabled={isValidating}
                autoFocus
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm border border-red-500 p-2">
                [ERROR] {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isValidating}
              className="w-full vhs-button py-3 px-6 font-bold vhs-transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? "[VALIDATING...]" : "[AUTHENTICATE]"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowTokenInput(false);
                setToken("");
                setError("");
              }}
              className="w-full text-cyan-500 hover:text-magenta-500 text-sm underline"
            >
              ← BACK
            </button>
          </form>
        )}

        <div className="mt-6 text-sm text-center space-y-3 vhs-text">
          <p className="font-semibold text-cyan-500">
            REQUIRED PERMISSIONS:
          </p>
          <div className="flex justify-center gap-2">
            <span className="px-2 py-1 border border-cyan-500 font-mono text-xs vhs-permission-badge">
              NOTIFICATIONS
            </span>
            <span className="px-2 py-1 border border-cyan-500 font-mono text-xs vhs-permission-badge">
              REPO
            </span>
            <span className="px-2 py-1 border border-cyan-500 font-mono text-xs vhs-permission-badge">
              READ:ORG
            </span>
          </div>

          {showTokenInput ? (
            <div className="mt-4 p-3 border-2 border-yellow-500 text-left">
              <p className="text-yellow-500 font-medium mb-1">
                [!] TOKEN CREATION STEPS
              </p>
              <ol className="text-yellow-400 text-xs mt-1 ml-4 list-decimal space-y-1">
                <li>GITHUB OPENED IN NEW TAB</li>
                <li>CONFIRM SCOPES ARE SELECTED</li>
                <li>CLICK "GENERATE TOKEN"</li>
                <li>COPY THE TOKEN (STARTS WITH ghp_)</li>
                <li>PASTE IT ABOVE</li>
              </ol>
              <p className="text-xs text-cyan-500 mt-2">
                DON'T FORGET TO CONFIGURE SSO IF REQUIRED!
              </p>
            </div>
          ) : (
            <div className="mt-4 p-3 border-2 border-yellow-500 text-left">
              <p className="text-yellow-500 font-medium mb-1">
                [!] SSO CONFIGURATION REQUIRED
              </p>
              <ol className="text-yellow-400 text-xs mt-1 ml-4 list-decimal space-y-1">
                <li>CREATE TOKEN WITH REQUIRED SCOPES</li>
                <li>CLICK "CONFIGURE SSO" NEXT TO TOKEN</li>
                <li>AUTHORIZE TOKEN FOR YOUR ORGANIZATION</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
