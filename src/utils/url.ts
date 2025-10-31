import type { GitHubSubject } from "../types";

export function getSubjectUrl(subject: GitHubSubject): string {
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
}
