import { Container, Graphics, Sprite, Text, TextStyle, type Application } from "pixi.js";
import { TILE_SIZE } from "../../../lib/viewport";
import type { BodiesDB, HeadsDB, NPCsDB } from "../../../types/game";
import { Z_INDEX_LAYERS, getRowZIndex } from "../../game/rendering/mapLayers";
import { getBottomAnchoredGraphicPosition, getHeadSpritePosition } from "../../game/rendering/characterLayout";
import type { EditorMapModel, LayerIndex } from "../model/EditorMapModel";
import type { EditorTextureCache } from "./editorTextures";

/**
 * Renderizador del editor.
 *
 * Deliberadamente NO reusa `Engine`/`MapRendererCore` del juego: aquellos estan
 * atados al websocket, a la camara que sigue al jugador y al viewport de 21x21.
 * El editor necesita lo contrario (mapa entero, zoom libre, capas aisladas,
 * mutacion por tile). Lo que si comparte son las reglas de posicionamiento y
 * z-index, importadas del juego, para que lo que se ve en el editor sea
 * exactamente lo que se vera jugando.
 *
 * Los tiles se agrupan en chunks de 16x16: entrar/salir del viewport construye
 * o destruye chunks enteros, y editar un tile solo reconstruye su chunk.
 */

const CHUNK_TILES = 16;
const CHUNK_MARGIN = 1;

export type OverlayFlags = {
    grid: boolean;
    blocked: boolean;
    exits: boolean;
    objects: boolean;
    npcs: boolean;
    triggers: boolean;
    arenaSpawns: boolean;
};

export type LayerVisibility = Record<LayerIndex, boolean>;

/** Rectangulo de tiles inclusivo en ambos extremos, en coordenadas 1-based. */
export type TileRegion = { x0: number; y0: number; x1: number; y1: number };

/** DBs cliente del juego, las mismas que descarga el juego para dibujar personajes. */
export type NpcRenderAssets = {
    npcsDB?: NPCsDB;
    bodiesDB?: BodiesDB;
    headsDB?: HeadsDB;
};

/**
 * Direccion fija para la vista de pie del editor: no hay heading real que
 * seguir (el NPC no se mueve), asi que siempre se usa la misma pose.
 */
const NPC_PREVIEW_FACING: "1" | "2" | "3" | "4" = "3";

type ResolvedNpcVisual = {
    bodyGrh: number;
    headGrh?: number;
    headOffsetX: number;
    headOffsetY: number;
};

type Chunk = {
    key: string;
    cx: number;
    cy: number;
    containers: Record<LayerIndex, Container>;
    built: boolean;
};

export type HoverInfo = { x: number; y: number } | null;

export class EditorScene {
    private readonly app: Application;
    private readonly textures: EditorTextureCache;
    private model: EditorMapModel;
    private readonly npcAssets: NpcRenderAssets;
    private readonly npcVisualCache = new Map<number, ResolvedNpcVisual | null>();

    /** Se mueve/escala con la camara; todo lo demas cuelga de aca. */
    readonly world = new Container();
    private readonly layerRoots: Record<LayerIndex, Container>;
    private readonly overlayGraphics = new Graphics();
    private readonly overlayLabels = new Container();
    private readonly hoverGraphics = new Graphics();

    private readonly chunks = new Map<string, Chunk>();
    private readonly dirtyChunks = new Set<string>();
    private overlaysDirty = true;

    private zoom = 1;
    private cameraX = 0;
    private cameraY = 0;
    private hover: HoverInfo = null;
    private selection: TileRegion | null = null;

    private layerVisibility: LayerVisibility = { 1: true, 2: true, 3: true, 4: true };
    private layerAlpha: Record<LayerIndex, number> = { 1: 1, 2: 1, 3: 1, 4: 1 };
    private overlays: OverlayFlags = {
        grid: true,
        blocked: false,
        exits: true,
        objects: true,
        npcs: true,
        triggers: false,
        arenaSpawns: true,
    };

    private destroyed = false;
    private pendingTextureLoad = false;

    constructor(app: Application, textures: EditorTextureCache, model: EditorMapModel, npcAssets: NpcRenderAssets = {}) {
        this.app = app;
        this.textures = textures;
        this.model = model;
        this.npcAssets = npcAssets;

        this.world.sortableChildren = true;

        this.layerRoots = {
            1: new Container(),
            2: new Container(),
            3: new Container(),
            4: new Container(),
        };

        // Capas 1 y 2 son planas; 3 y 4 ordenan por fila para que los arboles y
        // techos tapen correctamente lo que esta mas arriba en el mapa.
        this.layerRoots[1].zIndex = Z_INDEX_LAYERS.FLOOR;
        this.layerRoots[2].zIndex = Z_INDEX_LAYERS.BELOW;
        this.layerRoots[3].zIndex = 1000;
        this.layerRoots[4].zIndex = 2000;
        this.layerRoots[3].sortableChildren = true;
        this.layerRoots[4].sortableChildren = true;

        for (const layer of [1, 2, 3, 4] as LayerIndex[]) {
            this.world.addChild(this.layerRoots[layer]);
        }

        this.overlayGraphics.zIndex = 10000;
        this.overlayLabels.zIndex = 10001;
        this.hoverGraphics.zIndex = 10002;
        this.world.addChild(this.overlayGraphics);
        this.world.addChild(this.overlayLabels);
        this.world.addChild(this.hoverGraphics);

        this.app.stage.addChild(this.world);
    }

    setModel(model: EditorMapModel): void {
        this.model = model;
        this.clearChunks();
        this.overlaysDirty = true;
    }

    // -- camara ------------------------------------------------------------

    getZoom(): number {
        return this.zoom;
    }

    getCamera(): { x: number; y: number } {
        return { x: this.cameraX, y: this.cameraY };
    }

    /** Centro de la camara en pixeles de mundo. */
    setCamera(x: number, y: number, zoom = this.zoom): void {
        this.zoom = Math.min(4, Math.max(0.1, zoom));
        const mapPixelWidth = this.model.width * TILE_SIZE;
        const mapPixelHeight = this.model.height * TILE_SIZE;
        const halfViewX = this.app.screen.width / (2 * this.zoom);
        const halfViewY = this.app.screen.height / (2 * this.zoom);

        // Permitir un poco de aire alrededor del mapa, pero no perderlo de vista.
        this.cameraX = Math.min(mapPixelWidth + halfViewX * 0.5, Math.max(-halfViewX * 0.5, x));
        this.cameraY = Math.min(mapPixelHeight + halfViewY * 0.5, Math.max(-halfViewY * 0.5, y));

        this.applyCamera();
    }

    panByScreenDelta(dx: number, dy: number): void {
        this.setCamera(this.cameraX - dx / this.zoom, this.cameraY - dy / this.zoom);
    }

    /** Zoom manteniendo fijo el punto de pantalla indicado. */
    zoomAt(screenX: number, screenY: number, nextZoom: number): void {
        const before = this.screenToWorld(screenX, screenY);
        this.zoom = Math.min(4, Math.max(0.1, nextZoom));
        this.applyCamera();
        const after = this.screenToWorld(screenX, screenY);
        this.setCamera(this.cameraX + (before.x - after.x), this.cameraY + (before.y - after.y));
    }

    /** Centra la camara en un tile, sin cambiar el zoom. */
    centerOn(x: number, y: number): void {
        this.setCamera((x - 0.5) * TILE_SIZE, (y - 0.5) * TILE_SIZE);
    }

    fitToScreen(): void {
        const zoomX = this.app.screen.width / (this.model.width * TILE_SIZE);
        const zoomY = this.app.screen.height / (this.model.height * TILE_SIZE);
        this.setCamera(
            (this.model.width * TILE_SIZE) / 2,
            (this.model.height * TILE_SIZE) / 2,
            Math.min(zoomX, zoomY) * 0.96,
        );
    }

    private applyCamera(): void {
        this.world.scale.set(this.zoom);
        this.world.x = this.app.screen.width / 2 - this.cameraX * this.zoom;
        this.world.y = this.app.screen.height / 2 - this.cameraY * this.zoom;
    }

    screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        return {
            x: (screenX - this.world.x) / this.zoom,
            y: (screenY - this.world.y) / this.zoom,
        };
    }

    screenToTile(screenX: number, screenY: number): { x: number; y: number } | null {
        const world = this.screenToWorld(screenX, screenY);
        const x = Math.floor(world.x / TILE_SIZE) + 1;
        const y = Math.floor(world.y / TILE_SIZE) + 1;

        return this.model.inBounds(x, y) ? { x, y } : null;
    }

    setHover(tile: HoverInfo): void {
        const changed = this.hover?.x !== tile?.x || this.hover?.y !== tile?.y;
        this.hover = tile;

        if (changed) {
            this.drawHover();
        }
    }

    // -- capas y overlays ---------------------------------------------------

    setLayerVisibility(visibility: LayerVisibility): void {
        this.layerVisibility = visibility;

        for (const layer of [1, 2, 3, 4] as LayerIndex[]) {
            this.layerRoots[layer].visible = visibility[layer];
        }
    }

    setLayerAlpha(alpha: Record<LayerIndex, number>): void {
        this.layerAlpha = alpha;

        for (const layer of [1, 2, 3, 4] as LayerIndex[]) {
            this.layerRoots[layer].alpha = alpha[layer];
        }
    }

    setOverlays(overlays: OverlayFlags): void {
        this.overlays = overlays;
        this.overlaysDirty = true;
    }

    setSelection(selection: TileRegion | null): void {
        this.selection = selection;
        this.drawHover();
    }

    markTileDirty(x: number, y: number): void {
        const key = this.chunkKeyFor(x, y);

        if (this.chunks.has(key)) {
            this.dirtyChunks.add(key);
        }

        this.overlaysDirty = true;
    }

    markAllDirty(): void {
        for (const key of this.chunks.keys()) {
            this.dirtyChunks.add(key);
        }

        this.overlaysDirty = true;
    }

    // -- construccion de chunks --------------------------------------------

    private chunkKeyFor(x: number, y: number): string {
        return `${Math.floor((x - 1) / CHUNK_TILES)},${Math.floor((y - 1) / CHUNK_TILES)}`;
    }

    private visibleChunkRange(): { cx0: number; cy0: number; cx1: number; cy1: number } {
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this.app.screen.width, this.app.screen.height);

        const chunkPixels = CHUNK_TILES * TILE_SIZE;
        const maxCx = Math.floor((this.model.width - 1) / CHUNK_TILES);
        const maxCy = Math.floor((this.model.height - 1) / CHUNK_TILES);

        return {
            cx0: Math.max(0, Math.floor(topLeft.x / chunkPixels) - CHUNK_MARGIN),
            cy0: Math.max(0, Math.floor(topLeft.y / chunkPixels) - CHUNK_MARGIN),
            cx1: Math.min(maxCx, Math.floor(bottomRight.x / chunkPixels) + CHUNK_MARGIN),
            cy1: Math.min(maxCy, Math.floor(bottomRight.y / chunkPixels) + CHUNK_MARGIN),
        };
    }

    private createChunk(cx: number, cy: number): Chunk {
        const containers: Record<LayerIndex, Container> = {
            1: new Container(),
            2: new Container(),
            3: new Container(),
            4: new Container(),
        };

        // Los contenedores de capa 3 y 4 se ordenan por fila dentro del root.
        containers[3].sortableChildren = true;
        containers[4].sortableChildren = true;

        for (const layer of [1, 2, 3, 4] as LayerIndex[]) {
            this.layerRoots[layer].addChild(containers[layer]);
        }

        return { key: `${cx},${cy}`, cx, cy, containers, built: false };
    }

    private destroyChunk(chunk: Chunk): void {
        for (const layer of [1, 2, 3, 4] as LayerIndex[]) {
            chunk.containers[layer].destroy({ children: true });
        }
    }

    private buildChunk(chunk: Chunk): void {
        for (const layer of [1, 2, 3, 4] as LayerIndex[]) {
            chunk.containers[layer].removeChildren().forEach((child) => child.destroy());
        }

        const x0 = chunk.cx * CHUNK_TILES + 1;
        const y0 = chunk.cy * CHUNK_TILES + 1;
        const x1 = Math.min(this.model.width, x0 + CHUNK_TILES - 1);
        const y1 = Math.min(this.model.height, y0 + CHUNK_TILES - 1);

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const tile = this.model.get(x, y);

                if (!tile) {
                    continue;
                }

                for (const layer of [1, 2, 3, 4] as LayerIndex[]) {
                    const grhId = tile.graphics[layer - 1];

                    if (grhId === null || grhId === undefined) {
                        continue;
                    }

                    const sprite = this.createTileSprite(grhId, x, y, layer);

                    if (sprite) {
                        chunk.containers[layer].addChild(sprite);
                    }
                }

                if (tile.spawn) {
                    this.appendNpcSprite(chunk, x, y, tile.spawn.npcIndex);
                }
            }
        }

        chunk.built = true;
    }

    /**
     * Resuelve npcIndex -> grh de cuerpo/cabeza via las mismas DBs que usa el
     * juego (`npcsDB`/`bodiesDB`/`headsDB`). Cacheado: la relacion npc->grh no
     * cambia entre mapas.
     */
    private resolveNpcVisual(npcIndex: number): ResolvedNpcVisual | null {
        const cached = this.npcVisualCache.get(npcIndex);

        if (cached !== undefined) {
            return cached;
        }

        const npc = this.npcAssets.npcsDB?.[String(npcIndex)];
        const bodyData = npc ? this.npcAssets.bodiesDB?.[String(npc.idBody)] : undefined;

        if (!npc || !bodyData) {
            this.npcVisualCache.set(npcIndex, null);
            return null;
        }

        const headData = npc.idHead > 0 ? this.npcAssets.headsDB?.[String(npc.idHead)] : undefined;

        const resolved: ResolvedNpcVisual = {
            bodyGrh: bodyData[NPC_PREVIEW_FACING],
            headGrh: headData ? headData[NPC_PREVIEW_FACING] : undefined,
            headOffsetX: bodyData.headOffsetX ?? 0,
            headOffsetY: bodyData.headOffsetY ?? 0,
        };

        this.npcVisualCache.set(npcIndex, resolved);
        return resolved;
    }

    /** Cuerpo (+ cabeza si tiene) del NPC parado en (x,y), anclado como las capas 3/4. */
    private appendNpcSprite(chunk: Chunk, x: number, y: number, npcIndex: number): void {
        const visual = this.resolveNpcVisual(npcIndex);

        if (!visual) {
            return;
        }

        const resolvedBodyGrh = this.textures.resolveStaticGrh(visual.bodyGrh);
        const bodyTexture = resolvedBodyGrh !== null ? this.textures.get(resolvedBodyGrh) : null;

        if (!bodyTexture) {
            return;
        }

        const originX = (x - 1) * TILE_SIZE;
        const originY = (y - 1) * TILE_SIZE;
        const zIndex = getRowZIndex(y, Z_INDEX_LAYERS.CHARACTER);

        const bodyPosition = getBottomAnchoredGraphicPosition(bodyTexture.width, bodyTexture.height);
        const bodySprite = new Sprite(bodyTexture);
        bodySprite.x = Math.round(originX + bodyPosition.x);
        bodySprite.y = Math.round(originY + bodyPosition.y);
        bodySprite.zIndex = zIndex;
        chunk.containers[3].addChild(bodySprite);

        if (visual.headGrh === undefined) {
            return;
        }

        const resolvedHeadGrh = this.textures.resolveStaticGrh(visual.headGrh);
        const headTexture = resolvedHeadGrh !== null ? this.textures.get(resolvedHeadGrh) : null;

        if (!headTexture) {
            return;
        }

        const bodyMetrics = {
            x: bodyPosition.x,
            y: bodyPosition.y,
            width: bodyTexture.width,
            height: bodyTexture.height,
        };
        const headPosition = getHeadSpritePosition(bodyMetrics, visual, headTexture);
        const headSprite = new Sprite(headTexture);
        headSprite.x = Math.round(originX + headPosition.x);
        headSprite.y = Math.round(originY + headPosition.y);
        headSprite.zIndex = zIndex;
        chunk.containers[3].addChild(headSprite);
    }

    /** Grh de cuerpo/cabeza de los NPCs en una region, para precargar junto con los tiles. */
    private collectNpcGraphicsInRegion(minX: number, minY: number, maxX: number, maxY: number): number[] {
        const result: number[] = [];
        const x0 = Math.max(1, minX);
        const y0 = Math.max(1, minY);
        const x1 = Math.min(this.model.width, maxX);
        const y1 = Math.min(this.model.height, maxY);

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const tile = this.model.get(x, y);

                if (!tile?.spawn) {
                    continue;
                }

                const visual = this.resolveNpcVisual(tile.spawn.npcIndex);

                if (!visual) {
                    continue;
                }

                result.push(visual.bodyGrh);

                if (visual.headGrh !== undefined) {
                    result.push(visual.headGrh);
                }
            }
        }

        return result;
    }

    /**
     * Reglas de posicionamiento identicas a las del juego: capas 1 y 2
     * ancladas arriba a la izquierda (`renderTileLayer`), capas 3 y 4 ancladas
     * abajo (`renderTileLayer` con anchor "bottom" y `renderRoofLayer`).
     */
    private createTileSprite(grhId: number, x: number, y: number, layer: LayerIndex): Sprite | null {
        const resolved = this.textures.resolveStaticGrh(grhId);

        if (resolved === null) {
            return null;
        }

        const texture = this.textures.get(resolved);
        const data = this.textures.getGraphicData(resolved);

        if (!texture || !data) {
            return null;
        }

        const sprite = new Sprite(texture);
        let spriteX = (x - 1) * TILE_SIZE;
        let spriteY = (y - 1) * TILE_SIZE;

        if (layer === 3 || layer === 4) {
            const position = getBottomAnchoredGraphicPosition(data.width, data.height);
            spriteX += position.x;
            spriteY += position.y;
        }

        sprite.x = Math.round(spriteX);
        sprite.y = Math.round(spriteY);

        if (layer === 3) {
            sprite.zIndex = getRowZIndex(y, Z_INDEX_LAYERS.ABOVE);
        } else if (layer === 4) {
            sprite.zIndex = getRowZIndex(y, Z_INDEX_LAYERS.ROOF);
        }

        return sprite;
    }

    private clearChunks(): void {
        for (const chunk of this.chunks.values()) {
            this.destroyChunk(chunk);
        }

        this.chunks.clear();
        this.dirtyChunks.clear();
    }

    // -- bucle --------------------------------------------------------------

    /** Reconcilia chunks visibles, carga texturas faltantes y redibuja overlays. */
    update(): void {
        if (this.destroyed) {
            return;
        }

        const { cx0, cy0, cx1, cy1 } = this.visibleChunkRange();
        const needed = new Set<string>();

        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                needed.add(`${cx},${cy}`);
            }
        }

        for (const [key, chunk] of [...this.chunks.entries()]) {
            if (!needed.has(key)) {
                this.destroyChunk(chunk);
                this.chunks.delete(key);
                this.dirtyChunks.delete(key);
            }
        }

        this.ensureVisibleTextures(cx0, cy0, cx1, cy1);

        for (const key of needed) {
            let chunk = this.chunks.get(key);

            if (!chunk) {
                const [cx, cy] = key.split(",").map(Number);
                chunk = this.createChunk(cx, cy);
                this.chunks.set(key, chunk);
                this.dirtyChunks.add(key);
            }
        }

        for (const key of [...this.dirtyChunks]) {
            const chunk = this.chunks.get(key);

            if (chunk) {
                this.buildChunk(chunk);
            }

            this.dirtyChunks.delete(key);
        }

        if (this.overlaysDirty) {
            this.drawOverlays();
            this.overlaysDirty = false;
        }
    }

    /**
     * Carga las texturas del area visible. Cuando terminan, marca los chunks
     * sucios para que se reconstruyan con los sprites ya disponibles.
     */
    private ensureVisibleTextures(cx0: number, cy0: number, cx1: number, cy1: number): void {
        if (this.pendingTextureLoad) {
            return;
        }

        const x0 = cx0 * CHUNK_TILES + 1;
        const y0 = cy0 * CHUNK_TILES + 1;
        const x1 = (cx1 + 1) * CHUNK_TILES;
        const y1 = (cy1 + 1) * CHUNK_TILES;

        const grhIds = this.model.graphicsInRegion(x0, y0, x1, y1);

        for (const grhId of this.collectNpcGraphicsInRegion(x0, y0, x1, y1)) {
            grhIds.add(grhId);
        }

        const missing = [...grhIds].filter((grhId) => {
            const resolved = this.textures.resolveStaticGrh(grhId);
            return resolved !== null && !this.textures.get(resolved);
        });

        if (missing.length === 0) {
            return;
        }

        this.pendingTextureLoad = true;
        void this.textures
            .ensure(missing)
            .then(() => {
                if (this.destroyed) {
                    return;
                }

                for (const key of this.chunks.keys()) {
                    this.dirtyChunks.add(key);
                }
            })
            .finally(() => {
                this.pendingTextureLoad = false;
            });
    }

    // -- overlays -----------------------------------------------------------

    /**
     * Hover y seleccion comparten este `Graphics` a proposito: se redibujan en
     * cada movimiento del mouse, y meterlos en los overlays obligaria a
     * reconstruir todas las etiquetas en cada frame de un arrastre.
     */
    private drawHover(): void {
        this.hoverGraphics.clear();

        if (this.selection) {
            const { x0, y0, x1, y1 } = this.selection;
            this.hoverGraphics
                .rect((x0 - 1) * TILE_SIZE, (y0 - 1) * TILE_SIZE, (x1 - x0 + 1) * TILE_SIZE, (y1 - y0 + 1) * TILE_SIZE)
                .fill({ color: 0x38bdf8, alpha: 0.12 })
                .stroke({ width: 2 / this.zoom, color: 0x38bdf8, alpha: 0.95 });
        }

        if (!this.hover) {
            return;
        }

        this.hoverGraphics
            .rect((this.hover.x - 1) * TILE_SIZE, (this.hover.y - 1) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            .stroke({ width: 2 / this.zoom, color: 0xffffff, alpha: 0.9 });
    }

    private drawOverlays(): void {
        const g = this.overlayGraphics;
        g.clear();
        this.overlayLabels.removeChildren().forEach((child) => child.destroy());

        const { cx0, cy0, cx1, cy1 } = this.visibleChunkRange();
        const x0 = Math.max(1, cx0 * CHUNK_TILES + 1);
        const y0 = Math.max(1, cy0 * CHUNK_TILES + 1);
        const x1 = Math.min(this.model.width, (cx1 + 1) * CHUNK_TILES);
        const y1 = Math.min(this.model.height, (cy1 + 1) * CHUNK_TILES);
        const lineWidth = 1 / this.zoom;

        if (this.overlays.grid && this.zoom >= 0.35) {
            for (let x = x0; x <= x1 + 1; x++) {
                g.moveTo((x - 1) * TILE_SIZE, (y0 - 1) * TILE_SIZE).lineTo((x - 1) * TILE_SIZE, y1 * TILE_SIZE);
            }

            for (let y = y0; y <= y1 + 1; y++) {
                g.moveTo((x0 - 1) * TILE_SIZE, (y - 1) * TILE_SIZE).lineTo(x1 * TILE_SIZE, (y - 1) * TILE_SIZE);
            }

            g.stroke({ width: lineWidth, color: 0xffffff, alpha: 0.12 });
        }

        const showLabels = this.zoom >= 0.9;
        const labelStyle = new TextStyle({ fontSize: 9, fill: 0xffffff });

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const tile = this.model.get(x, y);

                if (!tile) {
                    continue;
                }

                const px = (x - 1) * TILE_SIZE;
                const py = (y - 1) * TILE_SIZE;

                if (this.overlays.blocked && tile.blocked) {
                    g.rect(px, py, TILE_SIZE, TILE_SIZE).fill({ color: 0xff2d2d, alpha: 0.28 });
                }

                if (this.overlays.triggers && tile.trigger !== undefined) {
                    const isSafeZone = tile.trigger === 6;
                    const strokeColor = isSafeZone ? 0x10b981 : 0xff5cf2;
                    const fillColor = isSafeZone ? 0x10b981 : 0xff5cf2;

                    g.rect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2).fill({
                        color: fillColor,
                        alpha: isSafeZone ? 0.25 : 0.15,
                    });
                    g.rect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4).stroke({
                        width: lineWidth * 1.5,
                        color: strokeColor,
                        alpha: 0.9,
                    });

                    if (showLabels) {
                        const labelText = isSafeZone ? "6 (Segura)" : String(tile.trigger);
                        const label = new Text({ text: labelText, style: labelStyle });
                        label.x = px + 3;
                        label.y = py + 2;
                        this.overlayLabels.addChild(label);
                    }
                }

                if (this.overlays.exits && tile.exit) {
                    g.rect(px, py, TILE_SIZE, TILE_SIZE).fill({ color: 0x2dd4ff, alpha: 0.3 });

                    if (showLabels && "map" in tile.exit) {
                        const label = new Text({ text: `M${tile.exit.map}`, style: labelStyle });
                        label.x = px + 2;
                        label.y = py + TILE_SIZE - 12;
                        this.overlayLabels.addChild(label);
                    }
                }

                if (this.overlays.objects && tile.object) {
                    g.rect(px + 6, py + 6, TILE_SIZE - 12, TILE_SIZE - 12).stroke({
                        width: lineWidth * 1.5,
                        color: 0x4ade80,
                        alpha: 0.95,
                    });
                }

                if (this.overlays.npcs && (tile.spawn || tile.npc !== undefined)) {
                    // Badge chico en la esquina: el sprite real del NPC ya se dibuja
                    // sobre el tile, esto solo es la referencia de color (amarillo =
                    // spawn real de npcs.json; naranja = NPC inline legado).
                    const bx = px + 5;
                    const by = py + 5;
                    g.moveTo(bx, by - 4)
                        .lineTo(bx + 4, by)
                        .lineTo(bx, by + 4)
                        .lineTo(bx - 4, by)
                        .closePath()
                        .fill({ color: tile.spawn ? 0xfacc15 : 0xfb923c, alpha: 0.9 });
                }
            }
        }

        if (this.overlays.arenaSpawns) {
            this.drawArenaSpawns(g, labelStyle, showLabels);
        }
    }

    /**
     * Marcadores de spawns de equipo (`meta.arenaSpawns`), independientes de la
     * grilla de tiles: viven en la metadata del mapa, no en un tile individual.
     */
    private drawArenaSpawns(g: Graphics, labelStyle: TextStyle, showLabels: boolean): void {
        const spawns = this.model.meta.arenaSpawns;

        if (!spawns) {
            return;
        }

        const teams: Array<{ points: { x: number; y: number }[]; color: number; label: string }> = [
            { points: spawns.team1 ?? [], color: 0x38bdf8, label: "E1" },
            { points: spawns.team2 ?? [], color: 0xfb7185, label: "E2" },
        ];

        for (const team of teams) {
            team.points.forEach((point, index) => {
                if (!this.model.inBounds(point.x, point.y)) {
                    return;
                }

                const px = (point.x - 1) * TILE_SIZE;
                const py = (point.y - 1) * TILE_SIZE;
                const cx = px + TILE_SIZE / 2;
                const cy = py + TILE_SIZE / 2;

                g.rect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2).stroke({
                    width: 2 / this.zoom,
                    color: team.color,
                    alpha: 0.95,
                });
                g.circle(cx, cy, TILE_SIZE * 0.22).fill({ color: team.color, alpha: 0.85 });

                if (showLabels) {
                    const label = new Text({ text: `${team.label}·${index + 1}`, style: labelStyle });
                    label.x = px + 2;
                    label.y = py + 2;
                    this.overlayLabels.addChild(label);
                }
            });
        }
    }

    destroy(): void {
        this.destroyed = true;
        this.clearChunks();
        this.world.destroy({ children: true });
    }
}
