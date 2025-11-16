import { useState, useEffect, useRef } from "preact/hooks";
import { Login } from "./components/Login";
import { NotificationGroup } from "./components/NotificationGroup";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { DebugModal } from "./components/DebugModal";
import { useNotifications } from "./hooks/useNotifications";
import { useClickedNotifications } from "./hooks/useClickedNotifications";
import { STORAGE_KEYS } from "./config";

export function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEYS.TOKEN)
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEYS.EXPANDED_SECTION)
  );
  const [showMenu, setShowMenu] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    user,
    userTeams,
    loading,
    error,
    initialLoad,
    refreshAllPages,
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

  // Handle clicking outside menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

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

  const handleSectionToggle = (sectionKey: string) => {
    const newExpanded = expandedSection === sectionKey ? null : sectionKey;
    setExpandedSection(newExpanded);
    if (newExpanded) {
      localStorage.setItem(STORAGE_KEYS.EXPANDED_SECTION, newExpanded);
    } else {
      localStorage.removeItem(STORAGE_KEYS.EXPANDED_SECTION);
    }
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  // Categorize notifications
  const reviewRequests = notifications.filter(
    (g) => g.hasReviewRequest && !g.isTeamReviewRequest
  );
  const mentionsAndReplies = notifications.filter(
    (g) =>
      g.hasMention &&
      !g.hasTeamMention &&
      !g.hasReviewRequest &&
      !g.isTeamReviewRequest
  );

  // Group team notifications by team
  const teamNotifications: Record<
    string,
    { teamName: string; groups: typeof notifications }
  > = {};
  notifications.forEach((group) => {
    if (group.teamSlug && (group.isTeamReviewRequest || group.hasTeamMention)) {
      if (!teamNotifications[group.teamSlug]) {
        teamNotifications[group.teamSlug] = {
          teamName: group.teamName || group.teamSlug,
          groups: [],
        };
      }
      teamNotifications[group.teamSlug].groups.push(group);
    }
  });

  const ownContent = notifications.filter(
    (g) =>
      g.isOwnContent &&
      !g.hasReviewRequest &&
      !g.hasMention &&
      !g.isTeamReviewRequest &&
      !g.hasTeamMention
  );
  const needsAttention = notifications.filter(
    (g) =>
      g.isProminentForMe &&
      !g.isOwnContent &&
      !g.hasReviewRequest &&
      !g.hasMention &&
      !g.hasTeamMention &&
      !g.isTeamReviewRequest
  );
  const others = notifications.filter(
    (g) =>
      !g.isProminentForMe &&
      !g.isOwnContent &&
      !g.hasReviewRequest &&
      !g.hasMention &&
      !g.isTeamReviewRequest &&
      !g.hasTeamMention &&
      !g.teamSlug // Exclude anything with a team assignment
  );

  return (
    <div className="min-h-screen">
      {/* VHS SVG Filters */}
      <svg className="vhs-filters" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="vhs-tracking-line">
            {/* Create horizontal noise for the distortion */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02 0.001"
              numOctaves="1"
              result="noise"
              seed="2"
            />

            {/* Create a moving gradient mask */}
            <linearGradient
              id="scan-gradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="black" stopOpacity="1" />
              <stop offset="48%" stopColor="black" stopOpacity="1" />
              <stop offset="50%" stopColor="white" stopOpacity="1" />
              <stop offset="52%" stopColor="black" stopOpacity="1" />
              <stop offset="100%" stopColor="black" stopOpacity="1" />
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="0 -1"
                to="0 1"
                dur="20s"
                repeatCount="indefinite"
              />
            </linearGradient>

            {/* Apply the gradient as a mask */}
            <rect
              width="100%"
              height="200%"
              fill="url(#scan-gradient)"
              result="mask"
              y="-50%"
            />

            {/* Use the mask to selectively apply distortion */}
            <feComposite
              in="noise"
              in2="mask"
              operator="multiply"
              result="maskedNoise"
            />

            {/* Apply the distortion */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="maskedNoise"
              scale="15"
              xChannelSelector="R"
              yChannelSelector="B"
            />
          </filter>
        </defs>
      </svg>

      {/* Static noise overlay */}
      <div className="static-overlay" />

      {/* VHS Loading Screen */}
      {initialLoad && (
        <div className="vhs-loading">
          <div className="vhs-test-pattern">
            <div className="vhs-test-bar" />
            <div className="vhs-test-bar" />
            <div className="vhs-test-bar" />
            <div className="vhs-test-bar" />
            <div className="vhs-test-bar" />
            <div className="vhs-test-bar" />
            <div className="vhs-test-bar" />
          </div>
          <div className="vhs-loading-text vhs-text">LOADING</div>
        </div>
      )}

      {/* Sticky header */}
      <header
        ref={headerRef}
        className="sticky top-0 z-50 bg-black/90 border-b-2 border-cyan-500"
      >
        <div
          className={`relative transition-all duration-300 ${
            isScrolled ? "py-2" : "py-4"
          }`}
        >
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex items-center justify-between">
              <h1
                className={`font-bold vhs-text vhs-glitch transition-all duration-300 flex items-center gap-3 ${
                  isScrolled ? "text-2xl" : "text-4xl"
                }`}
              >
                {/* Retro TV Icon */}
                <svg
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className={`${isScrolled ? "w-8 h-8" : "w-12 h-12"}`}
                >
                  {/* TV Body */}
                  <rect
                    x="8"
                    y="20"
                    width="48"
                    height="36"
                    fill="#1a1a1a"
                    stroke="#00ffff"
                    strokeWidth="2"
                  />
                  {/* TV Screen */}
                  <rect
                    x="12"
                    y="24"
                    width="40"
                    height="28"
                    fill="#0a0a0a"
                    stroke="#00ffff"
                    strokeWidth="1"
                  />
                  {/* Screen Reflection */}
                  <path
                    d="M12 24 L28 40 L20 48 L12 48 Z"
                    fill="url(#screenGlow)"
                    opacity="0.3"
                  />
                  {/* Antenna Left */}
                  <line
                    x1="24"
                    y1="20"
                    x2="16"
                    y2="4"
                    stroke="#00ffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="16" cy="4" r="2" fill="#ff00ff" />
                  {/* Antenna Right */}
                  <line
                    x1="40"
                    y1="20"
                    x2="48"
                    y2="4"
                    stroke="#00ffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="48" cy="4" r="2" fill="#ff00ff" />
                  {/* Control Knobs */}
                  <circle
                    cx="46"
                    cy="30"
                    r="3"
                    fill="#1a1a1a"
                    stroke="#ffff00"
                    strokeWidth="1"
                  />
                  <circle
                    cx="46"
                    cy="40"
                    r="3"
                    fill="#1a1a1a"
                    stroke="#ffff00"
                    strokeWidth="1"
                  />
                  {/* TV Legs */}
                  <rect x="18" y="56" width="4" height="4" fill="#00ffff" />
                  <rect x="42" y="56" width="4" height="4" fill="#00ffff" />
                  <defs>
                    <linearGradient
                      id="screenGlow"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor="#00ffff" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#ff00ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
                ZENHUB
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
                  onClick={() => refreshAllPages()}
                  disabled={loading}
                  className={`vhs-button vhs-transition ${
                    isScrolled ? "py-1.5 px-3 text-sm" : "py-2 px-4"
                  }`}
                >
                  {loading ? "REFRESHING..." : "REFRESH"}
                </button>
                <button
                  onClick={handleLogout}
                  className={`vhs-button vhs-transition ${
                    isScrolled ? "py-1.5 px-3 text-sm" : "py-2 px-4"
                  }`}
                >
                  LOGOUT
                </button>

                {/* Kebab Menu */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className={`p-2 hover:bg-gray-800 transition-colors ${
                      isScrolled ? "p-1.5" : "p-2"
                    }`}
                    title="More options"
                  >
                    <svg
                      className={`text-gray-600 ${
                        isScrolled ? "w-5 h-5" : "w-6 h-6"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                      />
                    </svg>
                  </button>

                  {showMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      <button
                        onClick={() => {
                          setShowDebugModal(true);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-800 hover:text-cyan-500 text-gray-700 transition-colors"
                      >
                        Debug
                      </button>
                      <button
                        onClick={() => {
                          const currentToken = localStorage.getItem(
                            STORAGE_KEYS.TOKEN
                          );
                          localStorage.clear();
                          if (currentToken) {
                            localStorage.setItem(
                              STORAGE_KEYS.TOKEN,
                              currentToken
                            );
                          }
                          alert(
                            "All caches cleared (login preserved). Page will reload."
                          );
                          location.reload();
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-800 hover:text-cyan-500 text-gray-700 border-t border-gray-200 transition-colors"
                      >
                        Clear Cache
                      </button>
                    </div>
                  )}
                </div>
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
            isOpen={expandedSection === "review-requests"}
            onToggle={() => handleSectionToggle("review-requests")}
            isNavScrolled={isScrolled}
          >
            {reviewRequests.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
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
            isOpen={expandedSection === "mentions-replies"}
            onToggle={() => handleSectionToggle("mentions-replies")}
            isNavScrolled={isScrolled}
          >
            {mentionsAndReplies.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </CollapsibleSection>
        )}

        {/* Team-specific sections */}
        {Object.entries(teamNotifications).map(([teamSlug, teamData]) => (
          <CollapsibleSection
            key={teamSlug}
            title={teamData.teamName}
            count={teamData.groups.length}
            isOpen={expandedSection === `team-${teamSlug}`}
            onToggle={() => handleSectionToggle(`team-${teamSlug}`)}
            isNavScrolled={isScrolled}
          >
            {teamData.groups.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
                onLinkClick={() => markAsClicked(group.id)}
                isClicked={isClicked(group.id)}
              />
            ))}
          </CollapsibleSection>
        ))}

        {/* Your Activity */}
        {ownContent.length > 0 && (
          <CollapsibleSection
            title="Your Activity"
            count={ownContent.length}
            isOpen={expandedSection === "your-activity"}
            onToggle={() => handleSectionToggle("your-activity")}
            isNavScrolled={isScrolled}
          >
            {ownContent.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
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
            isOpen={expandedSection === "needs-attention"}
            onToggle={() => handleSectionToggle("needs-attention")}
            isNavScrolled={isScrolled}
          >
            {needsAttention.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
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
            isOpen={expandedSection === "other"}
            onToggle={() => handleSectionToggle("other")}
            isNavScrolled={isScrolled}
          >
            {others.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                onDismiss={() => dismissNotification(group.id)}
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
              className="gradient-blue-yellow text-white font-medium py-3 px-6 hover:shadow-lg transition-all duration-200 disabled:opacity-50 border-2 border-cyan-500"
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

      {/* Debug Modal */}
      <DebugModal
        isOpen={showDebugModal}
        onClose={() => setShowDebugModal(false)}
        notifications={notifications}
        userTeams={userTeams}
        user={user}
      />
    </div>
  );
}
