import { NextResponse } from "next/server";
import { forwardToGameDataApi, requireEditorAdmin } from "../../shared";

/**
 * Plantilla compartida de un NPC (`game_npcs` en la api), no la ubicacion en
 * un mapa. Editar aca afecta a todas las apariciones de este npcIndex.
 */

type RouteContext = { params: Promise<{ id: string }> };

function parseNpcId(raw: string): number | null {
    const id = Number.parseInt(raw, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const { id } = await context.params;
    const npcId = parseNpcId(id);

    if (npcId === null) {
        return NextResponse.json({ error: "Id de NPC invalido." }, { status: 400 });
    }

    return forwardToGameDataApi(`/admin/game-data/npcs/${npcId}`, "GET");
}

export async function PUT(request: Request, context: RouteContext) {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const { id } = await context.params;
    const npcId = parseNpcId(id);

    if (npcId === null) {
        return NextResponse.json({ error: "Id de NPC invalido." }, { status: 400 });
    }

    const body = await request.text();

    return forwardToGameDataApi(`/admin/game-data/npcs/${npcId}`, "PUT", body);
}
