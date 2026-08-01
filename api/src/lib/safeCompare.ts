import crypto from "crypto";

/**
 * Comparacion de strings en tiempo constante para secretos compartidos
 * (TOKEN_AUTH, token del proxy de datos de juego). Evita filtrar por timing
 * cuanto prefijo del secreto acerto quien esta probando.
 */
export function safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");

    if (leftBuffer.length !== rightBuffer.length) {
        // timingSafeEqual exige longitudes iguales: comparamos contra si mismo
        // para gastar un tiempo similar y devolvemos false igual.
        crypto.timingSafeEqual(leftBuffer, leftBuffer);
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
