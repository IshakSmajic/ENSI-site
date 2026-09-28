import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plant Pharmacy",
  description: "Informational website for a plant-based pharmacy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
