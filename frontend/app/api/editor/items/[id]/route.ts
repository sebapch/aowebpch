import { NextResponse } from "next/server";
import { forwardToGameDataApi, requireEditorAdmin } from "../../shared";

/** Plantilla de un item (`game_objects` en la api). */

type RouteContext = { params: Promise<{ id: string }> };

function parseItemId(raw: string): number | null {
    const id = Number.parseInt(raw, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const { id } = await context.params;
    const itemId = parseItemId(id);

    if (itemId === null) {
        return NextResponse.json({ error: "Id de item invalido." }, { status: 400 });
    }

    return forwardToGameDataApi(`/admin/game-data/objects/${itemId}`, "GET");
}

export async function PUT(request: Request, context: RouteContext) {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const { id } = await context.params;
    const itemId = parseItemId(id);

    if (itemId === null) {
        return NextResponse.json({ error: "Id de item invalido." }, { status: 400 });
    }

    const body = await request.text();

    return forwardToGameDataApi(`/admin/game-data/objects/${itemId}`, "PUT", body);
}
