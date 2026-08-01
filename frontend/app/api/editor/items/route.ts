import { forwardToGameDataApi, requireEditorAdmin } from "../shared";

/** Listado paginado y filtrable de plantillas de objetos (`game_objects`), para el catalogo de items del editor. */

export async function GET(request: Request) {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const objType = url.searchParams.get("objType")?.trim() ?? "";
    const page = url.searchParams.get("page")?.trim() ?? "";
    const limit = url.searchParams.get("limit")?.trim() ?? "";
    const params = new URLSearchParams();

    if (search) {
        params.set("search", search);
    }

    if (objType) {
        params.set("objType", objType);
    }

    if (page) {
        params.set("page", page);
    }

    params.set("limit", limit || "50");

    return forwardToGameDataApi(`/admin/game-data/objects?${params.toString()}`, "GET");
}
