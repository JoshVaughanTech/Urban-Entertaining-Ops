import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,

  /* The PDF is rendered by @react-pdf, which reads the brand fonts and the
     logo off disk at request time. Next's tracer cannot see those reads — the
     paths are built with path.join — so they are declared here. Without this
     the build succeeds and the PDF route throws ENOENT once deployed, where
     the repository is not on the filesystem.

     Both the download route and the send action render a quote, so the whole
     of /app is covered rather than one path. */
  outputFileTracingIncludes: {
    "/app/**": ["./assets/fonts/**", "./public/logo-navy.png"],
  },
};

export default nextConfig;
