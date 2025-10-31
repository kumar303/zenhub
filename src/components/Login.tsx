interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const handleLogin = () => {
    // For now, using Personal Access Token method
    // In production, you'd implement proper OAuth flow with a backend
    const token = prompt(
      'Enter your GitHub Personal Access Token with "notifications", "repo", and "read:org" scopes:\n\n' +
        "You can create one at: https://github.com/settings/tokens/new"
    );

    if (token) {
      onLogin(token.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full gradient-subtle">
        <h1 className="text-4xl font-bold mb-8 text-center gradient-olympic gradient-text">
          GitHub Notifications
        </h1>

        <div className="mb-8 text-center">
          <div className="inline-block p-4 rounded-full bg-gray-100 mb-4">
            <svg
              className="w-16 h-16 text-gray-700"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </div>
          <p className="text-gray-600">GitHub notifications but chill</p>
        </div>

        <button
          onClick={handleLogin}
          className="w-full gradient-blue-yellow text-white font-bold py-4 px-6 rounded-2xl hover:shadow-lg transition-all duration-200 transform hover:scale-105"
        >
          Login with GitHub
        </button>

        <div className="mt-6 text-sm text-gray-600 text-center space-y-3">
          <p className="font-semibold">
            You'll need a Personal Access Token with:
          </p>
          <div className="flex justify-center gap-2">
            <span className="px-2 py-1 bg-gray-100 rounded-lg font-mono text-xs">
              notifications
            </span>
            <span className="px-2 py-1 bg-gray-100 rounded-lg font-mono text-xs">
              repo
            </span>
            <span className="px-2 py-1 bg-gray-100 rounded-lg font-mono text-xs">
              read:org
            </span>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
            <p className="text-amber-800 font-medium mb-1">
              ⚠️ SSO Configuration Required
            </p>
            <ol className="text-amber-700 text-xs mt-1 ml-4 list-decimal space-y-1">
              <li>Create your token with the required scopes</li>
              <li>Click "Configure SSO" next to your new token</li>
              <li>Authorize the token for your organization</li>
            </ol>
          </div>

          <p className="text-xs pt-2">
            <a
              href="https://github.com/settings/tokens/new?scopes=notifications,repo,read:org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-olympic-blue hover:text-olympic-purple underline font-medium"
            >
              Create a new token →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
