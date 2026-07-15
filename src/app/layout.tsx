import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { ThemeSwitcher } from "~/app/_components/theme-switcher";
import { TRPCReactProvider } from "~/trpc/react";

// Applied before first paint so the stored theme wins with no flash. Mirrors
// the STORAGE_KEY + default in theme-switcher.tsx.
const themeInitScript = `(function(){try{var t=localStorage.getItem('catac-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export const metadata: Metadata = {
	title: "catac — prep tracker",
	description: "Local-first, Claude-driven MBA-entrance prep tracker",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={`${geist.variable}`}
			lang="en"
			data-theme="violet"
			suppressHydrationWarning
		>
			<head>
				{/* eslint-disable-next-line react/no-danger */}
				<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
			</head>
			<body>
				<ThemeSwitcher />
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
