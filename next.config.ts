import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CD-190 — Team Updates and Team Time were merged into one Team Activity page/nav item.
  // Temporary (307) redirects so any existing bookmark to either old route still lands on the
  // right tab of the new canonical page, without permanently hard-caching the destination.
  async redirects() {
    return [
      { source: "/dashboard/team-updates", destination: "/dashboard/team-activity?view=updates", permanent: false },
      { source: "/dashboard/team-time", destination: "/dashboard/team-activity?view=time", permanent: false },
    ];
  },
};

export default nextConfig;
