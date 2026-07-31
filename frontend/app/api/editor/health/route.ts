import { forwardToGameServer, requireEditorAdmin } from "../shared";

/** Estado del servidor de juego: si el editor esta activo y a que directorios puede escribir. */
export async function GET() {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    return forwardToGameServer("/editor/health", "GET", check.admin);
}
