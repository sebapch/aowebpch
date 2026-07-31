import { forwardToGameDataApi, requireEditorAdmin } from "../shared";

/** Busqueda de plantillas de objetos (`game_objects`), para elegir items de un drop. */

export async function GET(request: Request) {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const params = new URLSearchParams();

    if (search) {
        params.set("search", search);
    }

    params.set("limit", "25");

    return forwardToGameDataApi(`/admin/game-data/objects?${params.toString()}`, "GET");
}
