import { useState, useEffect } from "preact/hooks";
import { Login } from "./components/Login";
import { NotificationGroup } from "./components/NotificationGroup";
import { useNotifications } from "./hooks/useNotifications";
import { useClickedNotifications } from "./hooks/useClickedNotifications";
import { STORAGE_KEYS } from "./config";
import type { NotificationGroup as NotificationGroupType } from "./types";

export function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEYS.TOKEN)
  );

  const {
    notifications,
    user,
    loading,
    error,
    fetchNotifications,
    dismissNotification,
  } = useNotifications(token);

  const { markAsClicked, isClicked } = useClickedNotifications();

  // Handle OAuth callback (if implementing full OAuth flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code && !token) {
      // In a real app, exchange code for token via backend
      // For now, we're using PAT method
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token]);

  const handleLogin = (newToken: string) => {
    localStorage.setItem(STORAGE_KEYS.TOKEN, newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    setToken(null);
    window.location.reload();
  };

  const getSubjectUrl = (subject: NotificationGroupType["subject"]) => {
    // Convert API URL to web URL
    if (!subject.url) return "#";

    if (subject.type === "PullRequest") {
      return subject.url
        .replace("api.github.com/repos", "github.com")
        .replace("/pulls/", "/pull/");
    } else if (subject.type === "Issue") {
      return subject.url.replace("api.github.com/repos", "github.com");
    }
    return "#";
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  const ownContent = notifications.filter((g) => g.isOwnContent);
  const prominent = notifications.filter(
    (g) => g.isProminentForMe && !g.isOwnContent
  );
  const others = notifications.filter(
    (g) => !g.isProminentForMe && !g.isOwnContent
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl min-h-screen">
      <header className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-4xl font-bold gradient-olympic gradient-text">
            GitHub Notifications
          </h1>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-gray-600 flex items-center gap-2">
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="w-8 h-8 rounded-full"
                />
                {user.login}
              </span>
            )}
            <button
              onClick={fetchNotifications}
              disabled={loading}
              className="gradient-blue-yellow text-white font-medium py-2 px-4 rounded-xl hover:shadow-lg transition-all duration-200 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={handleLogout}
              className="bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-xl hover:bg-gray-300 transition-all duration-200"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4 animate-fade-in">
            {error}
          </div>
        )}
      </header>

      {/* Loading state */}
      {loading && notifications.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-block">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-olympic-blue"></div>
              <span className="text-lg text-gray-600">
                Loading notifications...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {notifications.length === 0 && !loading && !error && (
        <div className="text-center py-16 bg-white rounded-3xl shadow-lg gradient-subtle animate-fade-in">
          <p className="text-2xl text-gray-600">No notifications! 🎉</p>
          <p className="text-gray-500 mt-2">You're all caught up!</p>
        </div>
      )}

      {ownContent.length > 0 && (
        <section className="mb-8 animate-fade-in">
          <h2 className="text-2xl font-bold mb-4 gradient-purple-blue gradient-text">
            Your Activity
          </h2>
          <div className="space-y-4">
            {ownContent.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                getSubjectUrl={getSubjectUrl}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </div>
        </section>
      )}

      {prominent.length > 0 && (
        <section className="mb-8 animate-fade-in">
          <h2 className="text-2xl font-bold mb-4 gradient-green-red gradient-text">
            Needs Your Attention
          </h2>
          <div className="space-y-4">
            {prominent.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                getSubjectUrl={getSubjectUrl}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="mb-8 animate-fade-in">
          <h2 className="text-2xl font-bold mb-4 text-gray-700">
            Other Notifications
          </h2>
          <div className="space-y-4">
            {others.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                getSubjectUrl={getSubjectUrl}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Notification limit indicator */}
      {notifications.length >= 30 && (
        <div className="mt-8 mb-4 text-center text-sm text-gray-500 animate-fade-in">
          <p>Showing your most recent notifications (limited to 50)</p>
        </div>
      )}
    </div>
  );
}
