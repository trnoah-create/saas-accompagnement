import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

// Favicon généré depuis `siteConfig.name` : rien à régénérer en cas de renommage.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#ffffff",
          fontSize: 20,
          fontWeight: 700,
          borderRadius: 6,
        }}
      >
        {siteConfig.name.charAt(0)}
      </div>
    ),
    size,
  );
}
