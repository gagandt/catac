"use client";

import { useEffect, useState } from "react";

// The web UI is a dashboard; the *actions* (plan, log, replan) run as Claude Code
// skills that drive the same `catac` CLI. The browser can't launch a skill, so this
// dialog just tells the user exactly what to type in Claude, with one-tap copy.

type SkillCtaProps = {
	/** The slash command to run, e.g. "/plan-exam". */
	command: string;
	/** Button label. */
	label: string;
	/** One line explaining what the skill does, shown in the dialog. */
	blurb: string;
	/** Optional extra styles for the trigger button. */
	className?: string;
};

export function SkillCta({ command, label, blurb, className }: SkillCtaProps) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={
					className ??
					"rounded-lg bg-(--accent)/20 px-4 py-2 font-medium text-(--accent-light) ring-1 ring-(--accent)/40 transition hover:bg-(--accent)/30"
				}
			>
				{label}
			</button>
			{open && (
				<SkillDialog
					command={command}
					blurb={blurb}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

function SkillDialog({
	command,
	blurb,
	onClose,
}: {
	command: string;
	blurb: string;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState(false);

	// Close on Escape.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const copy = () => {
		void navigator.clipboard.writeText(command);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			onClick={onClose}
			role="presentation"
		>
			<div
				className="w-full max-w-md rounded-2xl bg-(--surface) p-6 text-(--ink) shadow-2xl ring-1 ring-(--ink)/10"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="font-bold text-xl">Run this in Claude Code</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-(--ink)/50 hover:text-(--ink)"
						aria-label="Close"
					>
						✕
					</button>
				</div>

				<p className="mt-2 text-sm text-(--ink)/70">{blurb}</p>

				<button
					type="button"
					onClick={copy}
					className="group mt-4 flex w-full items-center justify-between gap-3 rounded-lg bg-(--inset) px-4 py-3 ring-1 ring-(--ink)/10 transition hover:ring-(--accent)/50"
				>
					<code className="text-(--accent-light) text-lg">{command}</code>
					<span className="text-(--ink)/50 text-xs uppercase tracking-wide group-hover:text-(--ink)/80">
						{copied ? "copied ✓" : "copy"}
					</span>
				</button>

				<ol className="mt-4 flex flex-col gap-1.5 text-sm text-(--ink)/60">
					<li>1. Open your Claude Code session for this project.</li>
					<li>
						2. Paste{" "}
						<code className="rounded bg-(--inset) px-1 text-(--ink)/80">
							{command}
						</code>{" "}
						and send.
					</li>
					<li>3. Come back here — the dashboard updates automatically.</li>
				</ol>
			</div>
		</div>
	);
}
