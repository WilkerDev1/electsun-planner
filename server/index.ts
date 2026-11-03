import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { pool, migrate } from "./db.js";
import { loadUser, passwordHash } from "./auth.js";
import { eventsHandler } from "./events.js";
import { seedDemo } from "./seed.js";
import { serverToday } from "./today.js";
import { auth } from "./routes/auth.js";
import { accounts } from "./routes/accounts.js";
import { accessLinks } from "./routes/access-links.js";
import { access } from "./routes/access.js";
import { projects } from "./routes/projects.js";
import { statuses } from "./routes/statuses.js";
import { employees } from "./routes/employees.js";
import { teams } from "./routes/teams.js";
import { companies } from "./routes/companies.js";
import { companiesRead, employeesRead, statusesRead, teamsRead } from "./routes/catalogs.js";
import { mural } from "./routes/mural.js";
import { notices } from "./routes/notices.js";
import { viewMural } from "./routes/view-mural.js";
import { viewMovil } from "./routes/view-movil.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : "loopback");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: process.env.COOKIE_SECURE === "true" ? [] : null,
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  next();
});
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
app.get("/readyz", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ready" });
});

app.use(
  "/api",
  rateLimit({ windowMs: 60000, limit: 600, standardHeaders: "draft-8", legacyHeaders: false }),
  (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
);
app.use(express.json({ limit: "1mb" }), cookieParser());

// Escrituras solo desde la propia aplicación (NF-01).
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (req.get("Origin") !== process.env.APP_ORIGIN)
      return res.status(403).json({ message: "Origen de solicitud no autorizado." });
    if (req.get("Sec-Fetch-Site") === "cross-site")
      return res.status(403).json({ message: "Solicitud entre sitios rechazada." });
  }
  next();
});
app.use(loadUser);

app.use("/api/auth", auth);
app.use("/api/accounts", accounts);
app.use("/api/access-links", accessLinks);
app.use("/api/access", access);
app.use("/api/projects", projects);
app.use("/api/statuses", statusesRead, statuses);
app.use("/api/employees", employeesRead, employees);
app.use("/api/teams", teamsRead, teams);
app.use("/api/companies", companiesRead, companies);
app.use("/api/mural", mural);
app.use("/api/notices", notices);
app.use("/api/view/mural", viewMural);
app.use("/api/view/movil", viewMovil);
app.get("/api/events", eventsHandler);
app.use("/api", (_req, res) => res.status(404).json({ message: "Ruta no encontrada." }));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.use(
  express.static(path.join(root, "dist"), {
    index: false,
    maxAge: "1h",
    setHeaders: (res, file) => {
      // El service worker y el manifiesto deben revisarse en cada carga para que la PWA se actualice.
      if (/(sw\.js|workbox-[^/]+\.js|\.webmanifest)$/.test(file)) res.setHeader("Cache-Control", "no-cache");
    },
  }),
);
app.get("/{*path}", (_req, res) => res.sendFile(path.join(root, "dist/index.html")));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return res.end();
  if (error instanceof ZodError)
    return res.status(422).json({ message: error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
  const e = error as { status?: number; code?: string; message?: string };
  if (e.code === "23505") return res.status(409).json({ message: "Ese registro ya existe." });
  if (e.code === "23503") return res.status(422).json({ message: "Una referencia ya no está disponible." });
  if (e.code === "23514") return res.status(422).json({ message: "Un valor no cumple las reglas." });
  if (e.code === "LIMIT_FILE_SIZE") return res.status(422).json({ message: "El archivo supera el tamaño permitido." });
  if (!e.status) console.error("request_error", e.message);
  res.status(e.status ?? 500).json({
    message: e.status ? e.message : "No se pudo completar la solicitud. Intenta nuevamente.",
  });
});

export async function start() {
  if (!process.env.APP_ORIGIN) throw new Error("Falta APP_ORIGIN: sin él no se puede comprobar el origen de las escrituras.");
  await migrate();
  if (process.env.BOOTSTRAP_EMAIL && process.env.BOOTSTRAP_PASSWORD) {
    const present = await pool.query("SELECT id FROM users LIMIT 1");
    if (!present.rowCount)
      await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin')", [
        crypto.randomUUID(),
        process.env.BOOTSTRAP_NAME ?? "Administrador",
        process.env.BOOTSTRAP_EMAIL.toLowerCase(),
        await passwordHash(process.env.BOOTSTRAP_PASSWORD),
      ]);
  }
  if (process.env.SEED_DEMO === "true") {
    if (await seedDemo(serverToday())) console.log("Datos de demostración cargados");
    if (process.env.SEED_OFFICE_EMAIL && process.env.SEED_OFFICE_PASSWORD)
      await pool.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Oficina demo',$2,$3,'office') ON CONFLICT (email) DO NOTHING",
        [crypto.randomUUID(), process.env.SEED_OFFICE_EMAIL.toLowerCase(), await passwordHash(process.env.SEED_OFFICE_PASSWORD)],
      );
  }
  // Sesiones de cuenta y de dispositivo caducadas: se purgan al arrancar y cada hora.
  const purge = () =>
    pool
      .query("DELETE FROM sessions WHERE expires_at<now(); DELETE FROM device_sessions WHERE expires_at<now(); DELETE FROM invitations WHERE expires_at<now()-interval '30 days'")
      .catch(() => {});
  await purge();
  const purgeTimer = setInterval(purge, 3600000);
  purgeTimer.unref();
  const server = app.listen(Number(process.env.PORT ?? 8091), "0.0.0.0", () => console.log("Electsun Planner listo"));
  process.on("SIGTERM", () => server.close(() => void pool.end()));
  return server;
}

if (process.env.NODE_ENV !== "test")
  void start().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
