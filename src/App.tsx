import { useState, useEffect, useRef } from "preact/hooks";
import { Login } from "./components/Login";
import { NotificationGroup } from "./components/NotificationGroup";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { useNotifications } from "./hooks/useNotifications";
import { useClickedNotifications } from "./hooks/useClickedNotifications";
import { STORAGE_KEYS } from "./config";
import type { NotificationGroup as NotificationGroupType } from "./types";

export function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEYS.TOKEN)
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const {
    notifications,
    user,
    loading,
    error,
    initialLoad,
    fetchNotifications,
    dismissNotification,
    loadMore,
    hasMore,
    loadingMore,
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

  // Handle scroll events with debouncing to prevent jitter
  useEffect(() => {
    let rafId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let lastScrollY = 0;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Clear any pending animations/timeouts
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Only update if we've scrolled significantly or stopped scrolling
      rafId = requestAnimationFrame(() => {
        const scrollDelta = Math.abs(currentScrollY - lastScrollY);

        // Immediate update for large scroll changes
        if (scrollDelta > 10) {
          const scrolled = currentScrollY > 40;
          if (scrolled !== isScrolled) {
            setIsScrolled(scrolled);
          }
          lastScrollY = currentScrollY;
        } else {
          // Debounced update for small scroll changes
          timeoutId = setTimeout(() => {
            const scrolled = window.scrollY > 40;
            if (scrolled !== isScrolled) {
              setIsScrolled(scrolled);
            }
            lastScrollY = window.scrollY;
          }, 100);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isScrolled]);

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

  // Categorize notifications
  const reviewRequests = notifications.filter((g) => g.hasReviewRequest);
  const mentionsAndReplies = notifications.filter(
    (g) => (g.hasMention || g.hasTeamMention) && !g.hasReviewRequest
  );
  const ownContent = notifications.filter(
    (g) => g.isOwnContent && !g.hasReviewRequest && !g.hasMention
  );
  const needsAttention = notifications.filter(
    (g) =>
      g.isProminentForMe &&
      !g.isOwnContent &&
      !g.hasReviewRequest &&
      !g.hasMention &&
      !g.hasTeamMention
  );
  const others = notifications.filter(
    (g) =>
      !g.isProminentForMe &&
      !g.isOwnContent &&
      !g.hasReviewRequest &&
      !g.hasMention &&
      !g.hasTeamMention
  );

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <header ref={headerRef} className="sticky top-0 z-50 bg-white">
        <div
          className={`relative border-b border-gray-200 transition-all duration-300 ${
            isScrolled ? "py-2 shadow-md header-shadow" : "py-4"
          }`}
        >
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex items-center justify-between">
              <h1
                className={`font-bold gradient-olympic gradient-text transition-all duration-300 ${
                  isScrolled ? "text-2xl" : "text-4xl"
                }`}
              >
                Zenhub
              </h1>
              <div className="flex items-center gap-4">
                {user && (
                  <span className="text-gray-600 flex items-center gap-2">
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="w-8 h-8 rounded-full"
                    />
                    <span
                      className={`transition-all duration-300 ${
                        isScrolled ? "hidden sm:inline" : ""
                      }`}
                    >
                      {user.login}
                    </span>
                  </span>
                )}
                <button
                  onClick={() => fetchNotifications()}
                  disabled={loading}
                  className={`gradient-blue-yellow text-white font-medium rounded-xl hover:shadow-lg transition-all duration-200 disabled:opacity-50 ${
                    isScrolled ? "py-1.5 px-3 text-sm" : "py-2 px-4"
                  }`}
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  onClick={handleLogout}
                  className={`bg-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-300 transition-all duration-200 ${
                    isScrolled ? "py-1.5 px-3 text-sm" : "py-2 px-4"
                  }`}
                >
                  Logout
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mt-2 animate-fade-in">
                {error}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Loading state */}
        {(loading || initialLoad) && notifications.length === 0 && (
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
        {notifications.length === 0 && !loading && !initialLoad && !error && (
          <div className="text-center py-16 bg-white rounded-3xl shadow-lg gradient-subtle animate-fade-in">
            <p className="text-2xl text-gray-600">No notifications! 🎉</p>
            <p className="text-gray-500 mt-2">You're all caught up!</p>
          </div>
        )}

        {/* Review Requests - Top Priority */}
        {reviewRequests.length > 0 && (
          <CollapsibleSection
            title="Review Requests"
            count={reviewRequests.length}
            gradientClass="gradient-green-red gradient-text"
            defaultOpen={true}
            isNavScrolled={isScrolled}
          >
            {reviewRequests.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                getSubjectUrl={getSubjectUrl}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </CollapsibleSection>
        )}

        {/* Mentions and Replies */}
        {mentionsAndReplies.length > 0 && (
          <CollapsibleSection
            title="Mentions & Replies"
            count={mentionsAndReplies.length}
            gradientClass="gradient-blue-yellow gradient-text"
            defaultOpen={true}
            isNavScrolled={isScrolled}
          >
            {mentionsAndReplies.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                getSubjectUrl={getSubjectUrl}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </CollapsibleSection>
        )}

        {/* Your Activity */}
        {ownContent.length > 0 && (
          <CollapsibleSection
            title="Your Activity"
            count={ownContent.length}
            gradientClass="gradient-purple-blue gradient-text"
            defaultOpen={false}
            isNavScrolled={isScrolled}
          >
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
          </CollapsibleSection>
        )}

        {/* Needs Your Attention */}
        {needsAttention.length > 0 && (
          <CollapsibleSection
            title="Needs Your Attention"
            count={needsAttention.length}
            gradientClass="gradient-olympic gradient-text"
            defaultOpen={true}
            isNavScrolled={isScrolled}
          >
            {needsAttention.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                getSubjectUrl={getSubjectUrl}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </CollapsibleSection>
        )}

        {/* Other Notifications */}
        {others.length > 0 && (
          <CollapsibleSection
            title="Other Notifications"
            count={others.length}
            gradientClass="text-gray-700"
            defaultOpen={false}
            isNavScrolled={isScrolled}
          >
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
          </CollapsibleSection>
        )}

        {/* Load More Button */}
        {hasMore && (
          <div className="mt-8 mb-4 text-center animate-fade-in">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="gradient-blue-yellow text-white font-medium py-3 px-6 rounded-xl hover:shadow-lg transition-all duration-200 disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Loading more...
                </span>
              ) : (
                "Load More Notifications"
              )}
            </button>
          </div>
        )}

        {/* Notification count */}
        {notifications.length > 0 && (
          <div className="mt-4 mb-4 text-center text-sm text-gray-500 animate-fade-in">
            <p>
              Showing {notifications.length} notification
              {notifications.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
