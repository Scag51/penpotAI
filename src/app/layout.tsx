import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Équinoxes Studio IA",
  description: "Assistant design connecté à Penpot",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Raleway:wght@600&family=Montserrat:wght@300;400&family=Roboto+Condensed:wght@300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
