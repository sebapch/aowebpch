import { z } from "zod";
import type { PoolClient } from "pg";
import pool from "../db";
import type {
    RatingRankingEntryRecord,
    RatingRankingEntryResponse,
    RatingRankingListResponse,
} from "../types";

export const DEFAULT_RATING = 1200;
export const K_FACTOR = 32;

export function computeEloDelta(avgWinner: number, avgLoser: number): number {
    const expectedWinner = 1 / (1 + 10 ** ((avgLoser - avgWinner) / 400));
    return Math.round(K_FACTOR * (1 - expectedWinner));
}

type MatchParticipantInput = {
    characterId: string;
    teamSide: number;
};

const applyMatchRatingsSchema = z.object({
    challengeHistoryId: z.string().uuid(),
    teamSize: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    winnerSide: z.union([z.literal(1), z.literal(2)]),
    participants: z
        .array(
            z.object({
                characterId: z.string().uuid(),
                teamSide: z.union([z.literal(1), z.literal(2)]),
            }),
        )
        .min(2)
        .max(8),
});

export type RatingChangeResult = {
    characterId: string;
    before: number;
    after: number;
    delta: number;
    won: boolean;
};

export async function applyMatchRatings(
    client: PoolClient,
    input: {
        challengeHistoryId: string;
        teamSize: number;
        winnerSide: number;
        participants: MatchParticipantInput[];
    },
): Promise<RatingChangeResult[]> {
    const { challengeHistoryId, teamSize, winnerSide, participants } =
        applyMatchRatingsSchema.parse(input);
    const characterIds = participants.map((participant) => participant.characterId);

    await client.query(
        `
            INSERT INTO character_ratings (character_id)
            SELECT unnest($1::uuid[])
            ON CONFLICT (character_id) DO NOTHING
        `,
        [characterIds],
    );

    const currentRatings = await client.query<{
        character_id: string;
        rating: number;
    }>(
        `
            SELECT character_id, rating
            FROM character_ratings
            WHERE character_id = ANY($1::uuid[])
            FOR UPDATE
        `,
        [characterIds],
    );

    const ratingByCharacterId = new Map(
        currentRatings.rows.map((row) => [row.character_id, row.rating]),
    );

    const winners = participants.filter(
        (participant) => participant.teamSide === winnerSide,
    );
    const losers = participants.filter(
        (participant) => participant.teamSide !== winnerSide,
    );

    const averageRating = (list: MatchParticipantInput[]) =>
        list.reduce(
            (sum, participant) =>
                sum + (ratingByCharacterId.get(participant.characterId) ?? DEFAULT_RATING),
            0,
        ) / list.length;

    const delta = computeEloDelta(averageRating(winners), averageRating(losers));

    const updates = [
        ...winners.map((participant) => ({ participant, sign: 1, won: true })),
        ...losers.map((participant) => ({ participant, sign: -1, won: false })),
    ];

    const ratingChanges: RatingChangeResult[] = [];

    for (const { participant, sign, won } of updates) {
        const before =
            ratingByCharacterId.get(participant.characterId) ?? DEFAULT_RATING;
        const after = before + sign * delta;
        const netDelta = after - before;

        ratingChanges.push({
            characterId: participant.characterId,
            before,
            after,
            delta: netDelta,
            won,
        });

        await client.query(
            `
                UPDATE character_ratings
                SET rating = $1,
                    games_played = games_played + 1,
                    wins = wins + $2,
                    losses = losses + $3,
                    updated_at = NOW()
                WHERE character_id = $4
            `,
            [after, won ? 1 : 0, won ? 0 : 1, participant.characterId],
        );

        await client.query(
            `
                INSERT INTO rating_history (
                    challenge_history_id, character_id, team_size, rating_before, rating_after, delta
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
                challengeHistoryId,
                participant.characterId,
                teamSize,
                before,
                after,
                netDelta,
            ],
        );
    }

    return ratingChanges;
}

function toRatingRankingEntryResponse(
    record: RatingRankingEntryRecord,
): RatingRankingEntryResponse {
    return {
        characterId: record.character_id,
        name: record.name,
        rating: record.rating,
        gamesPlayed: record.games_played,
        wins: record.wins,
        losses: record.losses,
        level: record.level,
        idClase: record.id_clase,
        idRaza: record.id_raza,
        criminal: record.criminal,
        faction: record.faction,
        clanName: record.clan_name,
        headId: record.id_head,
        bodyId: record.id_body,
    };
}

export async function listRatingRanking(): Promise<RatingRankingListResponse> {
    const result = await pool.query<RatingRankingEntryRecord>(
        `
            SELECT
                cr.character_id,
                c.name,
                cr.rating,
                cr.games_played,
                cr.wins,
                cr.losses,
                c.level,
                c.id_clase,
                c.id_raza,
                COALESCE(c.criminal, FALSE) AS criminal,
                COALESCE(c.faction, 'none') AS faction,
                cl.name AS clan_name,
                CASE
                  WHEN (c.dead = TRUE OR c.muerto = TRUE OR c.navegando = TRUE) AND c.id_last_head > 0 THEN c.id_last_head
                  ELSE c.id_head
                END AS id_head,
                c.id_body
            FROM character_ratings cr
            JOIN characters c ON c.id = cr.character_id
            LEFT JOIN clans cl ON cl.id = c.clan_id
            WHERE c.deleted_at IS NULL
              AND (c.banned IS NULL OR c.banned < NOW())
              AND COALESCE(c.privileges, 0) = 0
            ORDER BY cr.rating DESC, cr.games_played DESC, c.name ASC
            LIMIT 50
        `,
    );

    return {
        entries: result.rows.map(toRatingRankingEntryResponse),
    };
}
