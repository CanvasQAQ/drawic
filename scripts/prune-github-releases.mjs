import { execFileSync } from "node:child_process";

function timestamp(release) {
  const value = Date.parse(release.publishedAt ?? release.createdAt ?? "");
  return Number.isFinite(value) ? value : 0;
}

export function selectReleasesToPrune(releases) {
  const published = releases.filter(
    (release) =>
      typeof release.tagName === "string" &&
      release.tagName.length > 0 &&
      release.isDraft !== true,
  );
  const newest = (candidates) =>
    [...candidates].sort(
      (a, b) =>
        timestamp(b) - timestamp(a) ||
        b.tagName.localeCompare(a.tagName, "en"),
    )[0];
  const latestPreview = newest(
    published.filter((release) => release.isPrerelease === true),
  );
  const latestStable = newest(
    published.filter((release) => release.isPrerelease === false),
  );
  const keep = new Set(
    [latestPreview?.tagName, latestStable?.tagName].filter(Boolean),
  );
  return published
    .filter((release) => !keep.has(release.tagName))
    .sort(
      (a, b) =>
        timestamp(a) - timestamp(b) ||
        a.tagName.localeCompare(b.tagName, "en"),
    )
    .map((release) => release.tagName);
}

function prunePublishedReleases() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY is required to prune GitHub releases.");
  }
  const output = execFileSync(
    "gh",
    [
      "release",
      "list",
      "--repo",
      repository,
      "--limit",
      "200",
      "--json",
      "tagName,isPrerelease,isDraft,createdAt,publishedAt",
    ],
    { encoding: "utf8" },
  );
  const releases = JSON.parse(output);
  const toDelete = selectReleasesToPrune(releases);
  for (const tag of toDelete) {
    execFileSync(
      "gh",
      [
        "release",
        "delete",
        tag,
        "--repo",
        repository,
        "--yes",
        "--cleanup-tag",
      ],
      { stdio: "inherit" },
    );
    console.log(`Removed superseded release and tag ${tag}.`);
  }
  if (toDelete.length === 0) {
    console.log("Release retention is already clean.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prunePublishedReleases();
}
