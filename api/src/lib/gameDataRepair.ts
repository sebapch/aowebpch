import type { PoolClient } from "pg";

import pool from "../db";
import { computeChecksum, loadSeedNpcsJson, loadSeedObjectsJson } from "./gameData";

// El seed de 6c453e7 se armo con los json del cliente (frontend/public/init), que
// solo traen name/grhIndex/objType, y la normalizacion completo el resto con ceros.
// La base quedo sembrada asi y ensureSeeded() no vuelve a tocar una tabla que ya
// tiene filas, con lo cual un redeploy no la arregla. Estas sondas detectan ese
// dataset: son campos que solo existen en los datos del servidor, y ninguno puede
// faltar en las 1062 filas reales. Si falta aunque sea uno, la base esta vaciada y
// la reimportamos desde el seed. Si estan todas no se toca nada, para no pisar las
// ediciones hechas desde el editor.
type TableProbe = { label: string; sql: string };

const OBJECT_PROBES: TableProbe[] = [
  {
    label: "anim (animacion del equipo)",
    sql: "SELECT 1 FROM game_objects WHERE (data->>'anim')::numeric > 0 LIMIT 1",
  },
  {
    label: "indexAbierta (puertas)",
    sql: "SELECT 1 FROM game_objects WHERE (data->>'indexAbierta')::numeric > 0 LIMIT 1",
  },
  {
    label: "tipoPocion (consumibles)",
    sql: "SELECT 1 FROM game_objects WHERE (data->>'tipoPocion')::numeric > 0 LIMIT 1",
  },
  {
    label: "clasesNoPermitidas",
    sql: "SELECT 1 FROM game_objects WHERE jsonb_array_length(COALESCE(data->'clasesNoPermitidas', '[]'::jsonb)) > 0 LIMIT 1",
  },
];

const NPC_PROBES: TableProbe[] = [
  {
    label: "npcType",
    sql: "SELECT 1 FROM game_npcs WHERE (data->>'npcType')::numeric > 0 LIMIT 1",
  },
  {
    label: "objs (inventario de comerciantes)",
    sql: "SELECT 1 FROM game_npcs WHERE jsonb_array_length(COALESCE(data->'objs', '[]'::jsonb)) > 0 LIMIT 1",
  },
  {
    label: "drop",
    sql: "SELECT 1 FROM game_npcs WHERE jsonb_array_length(COALESCE(data->'drop', '[]'::jsonb)) > 0 LIMIT 1",
  },
  {
    label: "maxHp (stats de combate)",
    sql: "SELECT 1 FROM game_npcs WHERE (data->>'maxHp')::numeric > 0 LIMIT 1",
  },
];

async function findMissingProbes(table: string, probes: TableProbe[]): Promise<string[]> {
  const populated = await pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${table}`);

  // Tabla vacia: de eso se encarga ensureSeeded() en el primer arranque.
  if (Number(populated.rows[0]?.total ?? 0) === 0) {
    return [];
  }

  const missing: string[] = [];

  for (const probe of probes) {
    const result = await pool.query(probe.sql);
    if (result.rowCount === 0) {
      missing.push(probe.label);
    }
  }

  return missing;
}

// Un upsert por fila son cuatro round trips por entidad; para ~1400 entidades contra
// un pooler eso son minutos, y esto corre antes de que el server escuche. Va todo en
// un parametro jsonb para no depender del escapeo de arrays de texto.
async function rewriteObjects(client: PoolClient): Promise<number> {
  const rows = loadSeedObjectsJson();
  const seed = rows.map((row) => ({
    id: row.id,
    name: row.data.name,
    objType: row.data.objType,
    data: row.data,
    checksum: computeChecksum(row.data),
  }));

  await client.query(
    `
      INSERT INTO game_objects (id, name, obj_type, data, checksum, version, updated_at)
      SELECT (seed->>'id')::int,
             seed->>'name',
             (seed->>'objType')::int,
             seed->'data',
             seed->>'checksum',
             0,
             NOW()
      FROM jsonb_array_elements($1::jsonb) AS seed
      ON CONFLICT (id)
      DO UPDATE SET name = EXCLUDED.name,
                    obj_type = EXCLUDED.obj_type,
                    data = EXCLUDED.data,
                    checksum = EXCLUDED.checksum,
                    updated_at = NOW()
    `,
    [JSON.stringify(seed)],
  );

  await bumpVersions(client, "game_objects", "objs", seed);

  return seed.length;
}

async function rewriteNpcs(client: PoolClient): Promise<number> {
  const rows = loadSeedNpcsJson();
  const seed = rows.map((row) => ({
    id: row.id,
    name: row.data.name,
    npcType: row.data.npcType,
    idHead: row.data.idHead,
    idBody: row.data.idBody,
    movement: row.data.movement,
    data: row.data,
    checksum: computeChecksum(row.data),
  }));

  await client.query(
    `
      INSERT INTO game_npcs (id, name, npc_type, id_head, id_body, movement, data, checksum, version, updated_at)
      SELECT (seed->>'id')::int,
             seed->>'name',
             (seed->>'npcType')::int,
             (seed->>'idHead')::int,
             (seed->>'idBody')::int,
             (seed->>'movement')::int,
             seed->'data',
             seed->>'checksum',
             0,
             NOW()
      FROM jsonb_array_elements($1::jsonb) AS seed
      ON CONFLICT (id)
      DO UPDATE SET name = EXCLUDED.name,
                    npc_type = EXCLUDED.npc_type,
                    id_head = EXCLUDED.id_head,
                    id_body = EXCLUDED.id_body,
                    movement = EXCLUDED.movement,
                    data = EXCLUDED.data,
                    checksum = EXCLUDED.checksum,
                    updated_at = NOW()
    `,
    [JSON.stringify(seed)],
  );

  await bumpVersions(client, "game_npcs", "npcs", seed);

  return seed.length;
}

// El server de juego sincroniza pidiendo cambios desde una version, y la version de
// cada fila es el id de su ultima revision. Sin revisiones nuevas la reparacion
// quedaria invisible para los procesos que ya estan levantados.
async function bumpVersions(
  client: PoolClient,
  table: string,
  kind: string,
  seed: Array<{ id: number; checksum: string }>,
): Promise<void> {
  const revisions = await client.query<{ id: string; entity_id: number }>(
    `
      INSERT INTO game_data_revisions (kind, entity_id, action, checksum)
      SELECT $1, (seed->>'id')::int, 'upsert', seed->>'checksum'
      FROM jsonb_array_elements($2::jsonb) AS seed
      RETURNING id, entity_id
    `,
    [kind, JSON.stringify(seed.map(({ id, checksum }) => ({ id, checksum })))],
  );

  await client.query(
    `
      UPDATE ${table} AS target
      SET version = (revision->>'version')::bigint
      FROM jsonb_array_elements($1::jsonb) AS revision
      WHERE target.id = (revision->>'id')::int
    `,
    [JSON.stringify(revisions.rows.map((row) => ({ id: row.entity_id, version: row.id })))],
  );
}

export type GameDataRepairResult = {
  repaired: boolean;
  reasons: string[];
  objects: number;
  npcs: number;
};

export async function repairGuttedGameData(): Promise<GameDataRepairResult> {
  const reasons = [
    ...(await findMissingProbes("game_objects", OBJECT_PROBES)).map((label) => `game_objects sin ${label}`),
    ...(await findMissingProbes("game_npcs", NPC_PROBES)).map((label) => `game_npcs sin ${label}`),
  ];

  if (reasons.length === 0) {
    return { repaired: false, reasons, objects: 0, npcs: 0 };
  }

  console.warn(`[GAME DATA] Datos incompletos detectados (${reasons.join("; ")}). Reimportando desde el seed.`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const objects = await rewriteObjects(client);
    const npcs = await rewriteNpcs(client);
    await client.query("COMMIT");

    console.log(`[GAME DATA] Reparacion aplicada: ${objects} objetos y ${npcs} NPCs reescritos.`);

    return { repaired: true, reasons, objects, npcs };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
