import type { MetadataRoute } from "next";

// App Router file convention: served at /manifest.webmanifest and Next auto-injects
// the <link rel="manifest"> tag. This is what makes MBA-Vault installable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MBA-Vault",
    short_name: "MBA-Vault",
    description:
      "Private, searchable vault over my MBA & Product School coursework.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
