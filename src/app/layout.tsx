import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import { FormSessionProvider } from "@/lib/form-session-context";
import "./globals.css";

const atkinsonHyperlegible = Atkinson_Hyperlegible({
  variable: "--font-atkinson-hyperlegible",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FormFill",
  description:
    "FormFill helps blind and low vision users fill out PDF forms and scanned form images.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${atkinsonHyperlegible.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <FormSessionProvider>
          <Navbar />
          {children}
        </FormSessionProvider>
      </body>
    </html>
  );
}
