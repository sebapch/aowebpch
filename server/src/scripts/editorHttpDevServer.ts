import http from "node:http";
import config = require("../config");
import { handleEditorRequest, isEditorRequest } from "../editorHttp";
import { handleMapAssetRequest, isMapAssetRequest } from "../mapHttp";

/**
 * Levanta solo el router del editor, sin el resto del servidor de juego.
 *
 * El servidor completo necesita la api y la base de datos para arrancar; esto
 * permite desarrollar y probar el editor sin todo ese stack. El juego monta el
 * mismo router en su propio `http.Server` (ver `src/server.ts`).
 */

const port = Number(process.env.EDITOR_DEV_PORT ?? 7667);

const server = http.createServer((request, response) => {
    if (isEditorRequest(request.url)) {
        void handleEditorRequest(request, response);
        return;
    }

    if (isMapAssetRequest(request.url)) {
        handleMapAssetRequest(request, response);
        return;
    }

    response.statusCode = 404;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "127.0.0.1", () => {
    console.log(`Editor dev server escuchando en http://127.0.0.1:${port}/editor/health`);
    console.log(`  editorEnabled=${config.editorEnabled} nodeEnv=${config.nodeEnv}`);
});
