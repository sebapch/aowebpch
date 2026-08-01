import type { Metadata } from "next";
import UpdatesPanel from "@/components/UpdatesPanel";
import changelogEntries from "@/data/changelog.json";
import roadmapEntries from "@/data/roadmap.json";
import { buildPageMetadata } from "@/lib/seo";

const latestFeatures = changelogEntries[0]?.features ?? [];
const nextFocus = roadmapEntries[0];

const updatesDescription = `Novedades, changelog y roadmap de CSAO2 con mejoras continuas en ${latestFeatures[0] ?? "jugabilidad"}, ${latestFeatures[1] ?? "balance de clases"} y objetivos como ${nextFocus?.title ?? "el desarrollo"}.`;

export const metadata: Metadata = buildPageMetadata({
    title: "Novedades y Roadmap",
    description: updatesDescription,
    path: "/updates",
    keywords: ["novedades CSAO2", "changelog CSAO2", "roadmap CSAO2"],
    imagePath: "/updates/opengraph-image",
    twitterImagePath: "/updates/twitter-image",
});

export default function UpdatesPage() {
    return (
        <main className="min-h-screen csao-bg px-4 py-12 text-slate-100">
            <div className="mx-auto max-w-4xl">
                <div className="mb-8 border-b border-slate-800 pb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        CSAO2
                    </span>
                    <h1 className="mt-1 text-2xl font-bold uppercase tracking-wide text-white md:text-3xl">
                        Novedades y Roadmap
                    </h1>
                </div>

                <UpdatesPanel mode="full" backHref="/characters" />
            </div>
        </main>
    );
}
