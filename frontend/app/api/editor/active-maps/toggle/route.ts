import { NextResponse } from "next/server";
import { forwardToGameServer, requireEditorAdmin } from "../../shared";

export async function POST(request: Request) {
    const check = await requireEditorAdmin();
    if (!check.ok) {
        return check.response;
    }

    const body = await request.text();
    return forwardToGameServer("/editor/active-maps/toggle", "POST", check.admin, body);
}
