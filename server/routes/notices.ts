import { Router } from "express";
import { z } from "zod";
import { pool, transaction, httpError } from "../db.js";
import type { Db } from "../db.js";
import { authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { NoticeBody, type Notice } from "../../shared/contracts/mural.js";

// F2·D — Avisos generales (AVI-02): CRUD para administración y oficina (ROL-02).
export const notices = Router();
notices.use(authenticated);

const COLUMNS = "id,text,starts_on,expires_on,sort";
const list = async (db: Db): Promise<Notice[]> =>
  (await db.query(`SELECT ${COLUMNS} FROM notices ORDER BY sort, starts_on, created_at`)).rows;

const idParam = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw httpError(404, "Ese aviso no existe.");
  return parsed.data;
};

notices.get("/", async (_req, res) => res.json(await list(pool)));

notices.post("/", async (req, res) => {
  const body = NoticeBody.parse(req.body);
  const created = await transaction(async (c) => {
    const row = (
      await c.query(
        `INSERT INTO notices(id,text,starts_on,expires_on,sort,created_by) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5) RETURNING ${COLUMNS}`,
        [body.text, body.starts_on, body.expires_on, body.sort, req.user!.id],
      )
    ).rows[0] as Notice;
    await audit(c, req.user!.id, "notice.create", "notice", row.id, diffOf(null, row));
    return row;
  });
  publishChange("notice");
  res.status(201).json(created);
});

// Cambio parcial: se mezcla con el aviso actual y el resultado se valida entero (la caducidad no puede ir antes del inicio).
const Partial = z.object({ text: z.string(), starts_on: z.string(), expires_on: z.string(), sort: z.number() }).partial();

notices.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const changes = Partial.parse(req.body);
  const updated = await transaction(async (c) => {
    const before = (await c.query(`SELECT ${COLUMNS} FROM notices WHERE id=$1 FOR UPDATE`, [id])).rows[0] as Notice | undefined;
    if (!before) throw httpError(404, "Ese aviso no existe.");
    const next = NoticeBody.parse({ ...before, ...changes });
    const row = (
      await c.query(`UPDATE notices SET text=$1,starts_on=$2,expires_on=$3,sort=$4 WHERE id=$5 RETURNING ${COLUMNS}`, [
        next.text,
        next.starts_on,
        next.expires_on,
        next.sort,
        id,
      ])
    ).rows[0] as Notice;
    const diff = diffOf(before, row);
    if (Object.keys(diff).length) await audit(c, req.user!.id, "notice.update", "notice", id, diff);
    return row;
  });
  publishChange("notice");
  res.json(updated);
});

notices.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  await transaction(async (c) => {
    const row = (await c.query(`DELETE FROM notices WHERE id=$1 RETURNING ${COLUMNS}`, [id])).rows[0] as Notice | undefined;
    if (!row) throw httpError(404, "Ese aviso no existe.");
    await audit(c, req.user!.id, "notice.delete", "notice", id, diffOf(row, {}));
  });
  publishChange("notice");
  res.status(204).end();
});
