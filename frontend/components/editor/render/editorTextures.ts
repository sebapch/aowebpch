import { Assets, Rectangle, Texture } from "pixi.js";
import type { GraphicsDB } from "../../../types/game";
import { getTexturePath } from "../../../utils/gameLoader";

/**
 * Recorta grh individuales de las hojas de sprites compartidas.
 *
 * Es la misma tecnica que usa el juego (`components/game/core/useAssetPipeline.ts`):
 * una sola `Texture` base por PNG y una `Texture` con `frame` por grh. La
 * diferencia es que el editor carga bajo demanda, a medida que aparecen tiles
 * en el viewport, en vez de precargar el mapa entero.
 */
export class EditorTextureCache {
    private readonly graphicsDB: GraphicsDB;
    private readonly textures = new Map<number, Texture>();
    private readonly animatedTextures = new Map<number, Texture[]>();
    private readonly sheetPromises = new Map<string, Promise<Texture | null>>();
    /** Hojas que ya fallaron, para no reintentar en cada frame. */
    private readonly failedSheets = new Set<string>();

    constructor(graphicsDB: GraphicsDB) {
        this.graphicsDB = graphicsDB;
    }

    getGraphicData(grhId: number) {
        return this.graphicsDB[String(grhId)];
    }

    /** Resuelve un grh animado a su primer frame, que es lo que se pinta en el editor. */
    resolveStaticGrh(grhId: number): number | null {
        const data = this.getGraphicData(grhId);

        if (!data) {
            return null;
        }

        if (data.numFrames > 1) {
            const firstFrame = data.frames?.["1"];
            const frameId = Number(firstFrame);

            if (Number.isFinite(frameId) && frameId > 0 && frameId !== grhId) {
                return this.resolveStaticGrh(frameId);
            }

            return null;
        }

        return grhId;
    }

    get(grhId: number): Texture | null {
        return this.textures.get(grhId) ?? null;
    }

    getAnimationFrames(grhId: number): Texture[] | null {
        return this.animatedTextures.get(grhId) ?? null;
    }

    private loadSheet(numFile: string): Promise<Texture | null> {
        const existing = this.sheetPromises.get(numFile);

        if (existing) {
            return existing;
        }

        const path = getTexturePath({ numFile } as never);
        const promise = Assets.load(path)
            .then((texture: Texture) => texture)
            .catch(() => {
                this.failedSheets.add(numFile);
                return null;
            });

        this.sheetPromises.set(numFile, promise);

        return promise;
    }

    /**
     * Garantiza que los grh pedidos tengan textura recortada.
     * Agrupa por hoja para hacer una sola carga por PNG.
     */
    async ensure(grhIds: Iterable<number>): Promise<void> {
        const pendingBySheet = new Map<string, number[]>();

        for (const grhId of grhIds) {
            const resolved = this.resolveStaticGrh(grhId);

            if (resolved === null || this.textures.has(resolved)) {
                continue;
            }

            const data = this.getGraphicData(resolved);

            if (!data || this.failedSheets.has(data.numFile)) {
                continue;
            }

            const bucket = pendingBySheet.get(data.numFile);

            if (bucket) {
                bucket.push(resolved);
            } else {
                pendingBySheet.set(data.numFile, [resolved]);
            }
        }

        if (pendingBySheet.size === 0) {
            return;
        }

        await Promise.all(
            [...pendingBySheet.entries()].map(async ([numFile, grhIdsForSheet]) => {
                const sheet = await this.loadSheet(numFile);

                if (!sheet) {
                    return;
                }

                for (const grhId of grhIdsForSheet) {
                    if (this.textures.has(grhId)) {
                        continue;
                    }

                    const data = this.getGraphicData(grhId);

                    if (!data) {
                        continue;
                    }

                    // Un grh puede declarar un recorte mayor que la hoja si el
                    // indice quedo desactualizado; recortar de mas rompe Pixi.
                    const width = Math.min(data.width, sheet.width - data.sX);
                    const height = Math.min(data.height, sheet.height - data.sY);

                    if (width <= 0 || height <= 0) {
                        continue;
                    }

                    this.textures.set(
                        grhId,
                        new Texture({
                            source: sheet.source,
                            frame: new Rectangle(data.sX, data.sY, width, height),
                        }),
                    );
                }
            }),
        );
    }

    /** Hoja completa, para el explorador de graficos. */
    sheetTexture(numFile: string): Promise<Texture | null> {
        return this.loadSheet(numFile);
    }

    destroy(): void {
        for (const texture of this.textures.values()) {
            texture.destroy(false);
        }

        this.textures.clear();
        this.animatedTextures.clear();
        this.sheetPromises.clear();
    }
}
