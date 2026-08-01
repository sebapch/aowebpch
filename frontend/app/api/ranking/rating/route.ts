import { NextResponse } from "next/server";
import { getApiBaseUrlCandidates } from "@/lib/api-base-url";
import { getRankingHeadSprites } from "@/lib/ranking-heads";
import type { RatingRankingPageData, RatingRankingResponse } from "@/lib/ranking";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawTeamSize = Number.parseInt(searchParams.get("teamSize") ?? "", 10);
    const teamSize = ([2, 3, 4].includes(rawTeamSize) ? rawTeamSize : 2) as 2 | 3 | 4;
    const query = new URLSearchParams({ teamSize: String(teamSize) });

    try {
        let ranking: RatingRankingResponse | null = null;

        for (const apiBaseUrl of getApiBaseUrlCandidates()) {
            try {
                const response = await fetch(
                    `${apiBaseUrl}/ranking/rating?${query.toString()}`,
                    {
                        next: { revalidate: 60 },
                    },
                );

                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking de rating");
                }

                ranking = (await response.json()) as RatingRankingResponse;
                break;
            } catch (error) {
                console.error(
                    `No se pudo cargar el ranking de rating desde ${apiBaseUrl}:`,
                    error,
                );
            }
        }

        if (!ranking) {
            throw new Error("No se pudo cargar el ranking de rating desde ningun origen");
        }

        const headSpritesById = await getRankingHeadSprites(
            ranking.entries.map((entry) => entry.headId),
        );
        const payload: RatingRankingPageData = {
            teamSize: ranking.teamSize,
            entries: ranking.entries,
            headSpritesById,
        };

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
            },
        });
    } catch (error) {
        console.error("No se pudo cargar el ranking de rating:", error);
        return NextResponse.json({
            teamSize,
            entries: [],
            headSpritesById: {},
        } satisfies RatingRankingPageData);
    }
}
