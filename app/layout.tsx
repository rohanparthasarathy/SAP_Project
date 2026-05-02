import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nutrition label analyzer",
  description: "Upload a nutrition facts photo for structured facts and simple guidance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
