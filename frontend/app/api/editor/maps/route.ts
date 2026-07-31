import { NextResponse } from "next/server";
import { forwardToGameServer, requireEditorAdmin } from "../shared";

/** Listado de mapas (`GET`) y creacion de mapas nuevos (`POST`, M3). */

async function handle(request: Request, method: string): Promise<NextResponse> {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const body = method === "GET" ? undefined : await request.text();

    return forwardToGameServer("/editor/maps", method, check.admin, body);
}

export async function GET(request: Request) {
    return handle(request, "GET");
}

export async function POST(request: Request) {
    return handle(request, "POST");
}
