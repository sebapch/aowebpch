/**
 * URL HTTP del servidor de juego, vista desde el servidor de Next.
 *
 * La usan el proxy del editor (`/api/editor/*`) y el de mapas en vivo
 * (`/api/maps/:id`). Nunca se expone al navegador: el cliente solo habla con
 * rutas de Next.
 */

const DEFAULT_GAME_SERVER_HTTP_URL = "http://127.0.0.1:7666";

export function getGameServerHttpUrl(): string {
    return process.env.GAME_SERVER_HTTP_URL?.trim() || DEFAULT_GAME_SERVER_HTTP_URL;
}
