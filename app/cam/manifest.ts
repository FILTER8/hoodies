import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hoodie Cam",
    short_name: "HoodieCam",
    start_url: "/cam",
    scope: "/cam",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ccff00",
    theme_color: "#ccff00",
    icons: [
      {
        src: "/cam-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/cam-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}