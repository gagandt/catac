"use client";

import { useEffect, useRef, useState } from "react";

// Color-theme picker (shadcn-style presets). Selecting a theme flips the
// `data-theme` attribute on <html> — which swaps the CSS variables defined in
// globals.css — and persists the choice to localStorage. The initial value is
// applied before paint by the inline script in layout.tsx (no flash of wrong
// theme); this component just keeps its own UI in sync and writes changes.

const STORAGE_KEY = "catac-theme";

type Theme = {
	id: string;
	label: string;
	mode: "dark" | "light";
	/** Accent color swatch (matches --accent for this theme). */
	accent: string;
	/** Gradient start, for a two-tone preview dot. */
	from: string;
};

const THEMES: Theme[] = [
	// Dark
	{ id: "violet", label: "Violet", mode: "dark", accent: "hsl(280 100% 70%)", from: "#2e026d" },
	{ id: "blue", label: "Blue", mode: "dark", accent: "hsl(217 91% 68%)", from: "#0b2a6b" },
	{ id: "emerald", label: "Emerald", mode: "dark", accent: "hsl(160 84% 52%)", from: "#043a2e" },
	{ id: "rose", label: "Rose", mode: "dark", accent: "hsl(346 90% 66%)", from: "#5b0a2c" },
	{ id: "amber", label: "Amber", mode: "dark", accent: "hsl(38 95% 56%)", from: "#5a3a05" },
	{ id: "slate", label: "Slate", mode: "dark", accent: "hsl(212 40% 72%)", from: "#1e293b" },
	// Light
	{ id: "paper", label: "Paper", mode: "light", accent: "hsl(280 65% 52%)", from: "#ece9f7" },
	{ id: "sky", label: "Sky", mode: "light", accent: "hsl(217 80% 52%)", from: "#dbe9fe" },
	{ id: "mint", label: "Mint", mode: "light", accent: "hsl(160 70% 36%)", from: "#d6f4e2" },
];

export function ThemeSwitcher() {
	const [current, setCurrent] = useState("violet");
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	// Adopt whatever the anti-FOUC script already applied to <html>.
	useEffect(() => {
		const t = document.documentElement.getAttribute("data-theme");
		if (t) setCurrent(t);
	}, []);

	// Close the popover on outside click or Escape.
	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("mousedown", onDown);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", onDown);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const pick = (id: string) => {
		document.documentElement.setAttribute("data-theme", id);
		try {
			localStorage.setItem(STORAGE_KEY, id);
		} catch {
			// Private-mode / disabled storage: theme still applies for this session.
		}
		setCurrent(id);
		setOpen(false);
	};

	const active = THEMES.find((t) => t.id === current) ?? THEMES[0]!;

	return (
		<div ref={ref} className="fixed top-4 right-4 z-50">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-label="Change color theme"
				aria-haspopup="menu"
				aria-expanded={open}
				className="flex items-center gap-2 rounded-full bg-(--ink)/10 px-3 py-2 text-sm text-(--ink)/80 ring-1 ring-(--ink)/10 backdrop-blur-sm transition hover:bg-(--ink)/20"
			>
				<span
					className="h-4 w-4 rounded-full ring-1 ring-(--ink)/30"
					style={{ background: active.accent }}
				/>
				<span className="hidden sm:inline">{active.label}</span>
			</button>

			{open && (
				<div
					role="menu"
					className="absolute right-0 mt-2 w-44 rounded-xl bg-(--surface) p-2 text-(--ink) shadow-2xl ring-1 ring-(--ink)/10"
				>
					{(["dark", "light"] as const).map((mode) => (
						<div key={mode} className="mt-1 first:mt-0">
							<div className="px-2 pt-1 pb-0.5 text-[10px] text-(--ink)/40 uppercase tracking-wider">
								{mode}
							</div>
							{THEMES.filter((t) => t.mode === mode).map((t) => (
								<button
									key={t.id}
									type="button"
									role="menuitemradio"
									aria-checked={t.id === current}
									onClick={() => pick(t.id)}
									className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-(--ink)/10"
								>
									<span
										className="h-5 w-5 rounded-full ring-1 ring-(--ink)/30"
										style={{
											backgroundImage: `linear-gradient(135deg, ${t.accent}, ${t.from})`,
										}}
									/>
									<span className="flex-1">{t.label}</span>
									{t.id === current && (
										<span className="text-(--accent-light)">✓</span>
									)}
								</button>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
