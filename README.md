# Electsun Planner

"El Excel, pero cómodo": la tabla de proyectos solares de Electsun convertida en un **mural de TV**, una **administración web** y una **vista móvil** para técnicos.

- Requisitos: [docs/REQUISITOS.md](docs/REQUISITOS.md)
- Plan y avance: [docs/PLAN.md](docs/PLAN.md)
- Diseño de referencia: `design/v4/*.dc.html` (Claude Design, V4 · Simple)
- Revisiones de código: [docs/revisiones/](docs/revisiones/)

> Todos los datos del repo son **ficticios**. Los datos reales se importan solo en el servidor.

## Demo local

Requiere Docker.

```bash
bash ops/local.sh
```

Abre http://localhost:8091. Las cuentas de demo (administrador y oficina) y sus contraseñas están en `.env`, que se genera la primera vez y no se sube a git.

## Desarrollo

```bash
npm install
bash ops/test-db.sh        # PostgreSQL de pruebas en 127.0.0.1:5544
npm run typecheck
npm test                   # unitarias + integración contra planner_test
```

Para trabajar con recarga en caliente, crea `.env` a partir de `.env.example` con `DATABASE_URL` y `PORT=8092`, y ejecuta `npm run server` y `npm run dev` (Vite en http://127.0.0.1:5173, con proxy a la API).

## Stack

React 19 + Vite + Tailwind 4 + PWA · Express 5 + PostgreSQL 16 + zod · Docker Compose con Caddy. Basado en Electsun Monitor.

| Carpeta | Contenido |
|---|---|
| `shared/` | `domain.ts` (calendario laborable, atraso, validaciones), `contracts/` (zod), `seed-demo.ts` |
| `server/` | API Express, migraciones, autenticación, SSE (`events.ts`), `routes/` por módulo |
| `src/` | `admin/` (Proyectos, Equipo, Mural, Cuentas), `mural/` (TV), `movil/` (PWA), `ui/` |
| `migrations/` | Esquema SQL |
| `ops/` | Demo local, backups, base de pruebas |
