import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CD-190 — Team Updates and Team Time were merged into one Team Activity page/nav item.
  // Temporary (307) redirects so any existing bookmark to either old route still lands on the
  // right tab of the new canonical page, without permanently hard-caching the destination.
  //
  // Phase 1 Template workspace (CD-206) — the admin Service catalog's visible route moved to
  // /dashboard/admin/templates; same temporary-redirect convention for any existing bookmark to
  // the old route (including a Template's own new [id] detail sub-route, which never existed at
  // the old path so it needs no redirect of its own).
  async redirects() {
    return [
      { source: "/dashboard/team-updates", destination: "/dashboard/team-activity?view=updates", permanent: false },
      { source: "/dashboard/team-time", destination: "/dashboard/team-activity?view=time", permanent: false },
      { source: "/dashboard/admin/services", destination: "/dashboard/admin/templates", permanent: false },
    ];
  },
};

export default nextConfig;
