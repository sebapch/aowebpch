import type { Metadata } from "next";
import RankingView from "@/components/RankingView";
import { getApiBaseUrlCandidates } from "@/lib/api-base-url";
import { getRankingHeadSprites } from "@/lib/ranking-heads";
import type { RatingRankingPageData, RatingRankingResponse } from "@/lib/ranking";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 60;

export const metadata: Metadata = buildPageMetadata({
    title: "Ranking ELO",
    description:
        "Consulta la tabla de clasificación pública de CSAO2 y sigue a los mejores duelistas por rating ELO.",
    path: "/ranking",
    keywords: ["ranking CSAO2", "leaderboard Counter Strike AO", "ranking ELO CSAO2", "top duelistas"],
});

async function getRanking(): Promise<RatingRankingPageData> {
    try {
        let ranking: RatingRankingResponse | null = null;

        for (const apiBaseUrl of getApiBaseUrlCandidates()) {
            try {
                const response = await fetch(`${apiBaseUrl}/ranking/rating`, {
                    next: { revalidate: 60 },
                });

                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking");
                }

                ranking = (await response.json()) as RatingRankingResponse;
                break;
            } catch (error) {
                console.error(
                    `No se pudo cargar el ranking desde ${apiBaseUrl}:`,
                    error,
                );
            }
        }

        if (!ranking) {
            throw new Error("No se pudo cargar el ranking desde ningun origen");
        }

        return {
            entries: ranking.entries,
            headSpritesById: await getRankingHeadSprites(
                ranking.entries.map((entry) => entry.headId),
            ),
        };
    } catch (error) {
        console.error("No se pudo cargar el ranking:", error);
        return { entries: [], headSpritesById: {} };
    }
}

export default async function RankingPage() {
    const ranking = await getRanking();

    return (
        <RankingView
            entries={ranking.entries}
            headSpritesById={ranking.headSpritesById}
        />
    );
}
