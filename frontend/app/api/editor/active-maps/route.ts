import { NextResponse } from "next/server";
import { forwardToGameServer, requireEditorAdmin } from "../shared";

export async function GET() {
    const check = await requireEditorAdmin();
    if (!check.ok) {
        return check.response;
    }

    return forwardToGameServer("/editor/active-maps", "GET", check.admin);
}
