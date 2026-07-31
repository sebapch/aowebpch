import { NextResponse } from "next/server";
import { requireEditorAdmin } from "../shared";

/** Gate del editor: dice si la sesion actual puede editar mapas. */
export async function GET() {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    return NextResponse.json({
        isAdmin: true,
        characterName: check.admin.characterName,
        accountName: check.admin.accountName,
    });
}
