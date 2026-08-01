"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import changelogEntries from "@/data/changelog.json";
import roadmapEntries from "@/data/roadmap.json";

type ChangelogEntry = {
    features: string[];
};

type RoadmapEntry = {
    title: string;
    items: string[];
};

type UpdatesPanelProps = {
    mode?: "preview" | "full";
    backHref?: string;
};

const reversedChangelogEntries = [
    ...(changelogEntries as ChangelogEntry[]),
].reverse();
const orderedRoadmapEntries = roadmapEntries as RoadmapEntry[];

export default function UpdatesPanel({
    mode = "preview",
    backHref,
}: UpdatesPanelProps) {
    const isPreview = mode === "preview";
    const [isChangelogExpanded, setIsChangelogExpanded] = useState(false);
    const [isRoadmapExpanded, setIsRoadmapExpanded] = useState(false);
    const changelogPreview = reversedChangelogEntries[0];
    const roadmapPreview = orderedRoadmapEntries[0];
    const visibleChangelogEntries =
        isPreview || !isChangelogExpanded
            ? reversedChangelogEntries.slice(0, 1)
            : reversedChangelogEntries;
    const visibleRoadmapEntries =
        isPreview || !isRoadmapExpanded
            ? orderedRoadmapEntries.slice(0, 1)
            : orderedRoadmapEntries;

    useEffect(() => {
        if (isPreview) {
            return;
        }

        const syncExpandedSections = () => {
            const rawHash = window.location.hash;
            const normalizedHash = rawHash.includes("#")
                ? `#${rawHash.split("#").filter(Boolean)[0] ?? ""}`
                : rawHash;

            if (normalizedHash && normalizedHash !== rawHash) {
                window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}${window.location.search}${normalizedHash}`,
                );
            }

            setIsChangelogExpanded(normalizedHash === "#changelog");
            setIsRoadmapExpanded(normalizedHash === "#roadmap");
        };

        syncExpandedSections();
        window.addEventListener("hashchange", syncExpandedSections);

        return () => {
            window.removeEventListener("hashchange", syncExpandedSections);
        };
    }, [isPreview]);

    const navigateToUpdatesSection = (section: "changelog" | "roadmap") => {
        if (typeof window !== "undefined") {
            window.location.assign(`/updates#${section}`);
        }
    };

    return (
        <div className="space-y-6">
            {backHref ? (
                <div className="flex justify-end">
                    <Link
                        href={backHref}
                        prefetch={false}
                        className="text-sm text-stone-300 transition hover:text-stone-100"
                    >
                        Volver
                    </Link>
                </div>
            ) : null}

            <section
                id="changelog"
                className="game-card p-5 shadow-lg space-y-4"
            >
                <div className="flex items-center justify-between gap-3 border-b border-[#3d2719] pb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                        Historial de Parches
                    </span>
                    {isPreview ? (
                        <button
                            type="button"
                            onClick={() =>
                                navigateToUpdatesSection("changelog")
                            }
                            className="text-xs font-bold uppercase tracking-wider text-slate-300 transition hover:text-white"
                        >
                            Ver Todo
                        </button>
                    ) : null}
                </div>

                <div className="space-y-4">
                    {isPreview ? (
                        changelogPreview ? (
                            <article className="game-card-inset p-4">
                                <span className="mb-2 inline-block rounded bg-[#5c2b0e] border border-[#8c582d] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                    Parche{" "}
                                    {String(changelogEntries.length).padStart(
                                        2,
                                        "0",
                                    )}
                                </span>

                                <ul className="mt-2 space-y-2 text-xs text-slate-300">
                                    {changelogPreview.features
                                        .slice(0, 3)
                                        .map((feature) => (
                                            <li
                                                key={feature}
                                                className="flex gap-2 leading-relaxed"
                                            >
                                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4a359]" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                </ul>
                            </article>
                        ) : null
                    ) : (
                        visibleChangelogEntries.map((entry, index) => (
                            <article
                                key={`${entry.features[0] ?? "update"}-${index}`}
                                className="game-card-inset p-4"
                            >
                                <span className="mb-2 inline-block rounded bg-[#5c2b0e] border border-[#8c582d] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                    Parche{" "}
                                    {String(
                                        changelogEntries.length - index,
                                    ).padStart(2, "0")}
                                </span>

                                <ul className="mt-2 space-y-2 text-xs text-slate-300">
                                    {entry.features.map((feature) => (
                                        <li
                                            key={feature}
                                            className="flex gap-2 leading-relaxed"
                                        >
                                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4a359]" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))
                    )}

                    {!isPreview && reversedChangelogEntries.length > 1 ? (
                        <button
                            type="button"
                            onClick={() =>
                                setIsChangelogExpanded((current) => !current)
                            }
                            className="w-full game-btn-bronze py-2 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm"
                        >
                            {isChangelogExpanded
                                ? "Mostrar Menos"
                                : "Mostrar Todo"}
                        </button>
                    ) : null}
                </div>
            </section>

            <section
                id="roadmap"
                className="game-card p-5 shadow-lg space-y-4"
            >
                <div className="flex items-center justify-between gap-3 border-b border-[#3d2719] pb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                        Roadmap de Desarrollo
                    </span>
                    {isPreview ? (
                        <button
                            type="button"
                            onClick={() => navigateToUpdatesSection("roadmap")}
                            className="text-xs font-bold uppercase tracking-wider text-slate-300 transition hover:text-white"
                        >
                            Ver Todo
                        </button>
                    ) : null}
                </div>

                <div className="space-y-4">
                    {isPreview ? (
                        roadmapPreview ? (
                            <article className="game-card-inset p-4">
                                <p className="text-sm font-bold text-white uppercase tracking-wide">
                                    {roadmapPreview.title}
                                </p>

                                <ul className="mt-2 space-y-2 text-xs text-slate-300">
                                    {roadmapPreview.items
                                        .slice(0, 2)
                                        .map((item) => (
                                            <li
                                                key={item}
                                                className="flex gap-2 leading-relaxed"
                                            >
                                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2bb3e5]" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                </ul>
                            </article>
                        ) : null
                    ) : (
                        visibleRoadmapEntries.map((entry) => (
                            <article
                                key={`${entry.title}`}
                                className="game-card-inset p-4"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm font-bold text-white uppercase tracking-wide">
                                        {entry.title}
                                    </p>
                                </div>

                                <ul className="mt-2 space-y-2 text-xs text-slate-300">
                                    {entry.items.map((item) => (
                                        <li
                                            key={item}
                                            className="flex gap-2 leading-relaxed"
                                        >
                                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2bb3e5]" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))
                    )}

                    {!isPreview && orderedRoadmapEntries.length > 1 ? (
                        <button
                            type="button"
                            onClick={() =>
                                setIsRoadmapExpanded((current) => !current)
                            }
                            className="w-full game-btn-bronze py-2 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm"
                        >
                            {isRoadmapExpanded
                                ? "Mostrar Menos"
                                : "Mostrar Todo"}
                        </button>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
