import type { MetadataRoute } from "next";

// MBA-Vault is served under /vault (basePath). Manifest field values are NOT
// auto-prefixed by Next, so start_url / scope / icon src carry the prefix explicitly.
const BASE = "/vault";

// App Router file convention: served at /vault/manifest.webmanifest and Next
// auto-injects the <link rel="manifest"> (basePath-aware). Makes MBA-Vault installable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: BASE,
    name: "MBA-Vault",
    short_name: "MBA-Vault",
    description:
      "Private, searchable vault over my MBA & Product School coursework.",
    start_url: BASE,
    scope: BASE,
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    orientation: "portrait-primary",
    icons: [
      { src: `${BASE}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: `${BASE}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
