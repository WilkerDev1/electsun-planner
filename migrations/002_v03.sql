-- v0.3 (docs/REQUISITOS.md): logotipo y patrón de empresa (EQP-07, EQP-08), catálogo de preparación (PRY-12, CAL-07).
-- 001_base.sql no se toca. Los estados no necesitan cambios de esquema: `projects.status_id` es la única referencia
-- a `statuses` y no tiene ON DELETE, así que el borrado (EST-05) mueve primero los proyectos al estado de reemplazo.

-- ---------- Empresas: patrón y logotipo ----------

ALTER TABLE companies
  ADD COLUMN pattern text NOT NULL DEFAULT 'solido'
  CHECK (pattern IN ('solido', 'rayas', 'rayas_finas', 'puntos', 'cuadricula', 'zigzag', 'diagonal_cruzada'));

CREATE TABLE company_logos (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 307200),
  sha256 char(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Preparación: catálogo editable y selección por proyecto ----------

CREATE TABLE prep_items (
  id uuid PRIMARY KEY,
  code varchar(4) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{1,4}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  -- Motivo de espera que se ve en el mural y el móvil ("planos", "espera permiso").
  pending_label text NOT NULL CHECK (length(pending_label) BETWEEN 1 AND 40),
  applies_to text NOT NULL DEFAULT 'todos' CHECK (applies_to IN ('todos', 'neta', 'hibrido')),
  default_on boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_prep (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  PRIMARY KEY (project_id, item_id)
);
CREATE INDEX project_prep_item ON project_prep(item_id);

-- Los tres parámetros que existían (mismos textos que usaba shared/domain.ts: «planos», «material», «EDE»).
INSERT INTO prep_items(id, code, name, pending_label, applies_to, default_on, sort) VALUES
  (gen_random_uuid(), 'PL', 'Planos y BOM', 'planos', 'todos', true, 1),
  (gen_random_uuid(), 'MA', 'Materiales completos', 'material', 'todos', true, 2),
  (gen_random_uuid(), 'EDE', 'Carta de no objeción', 'EDE', 'neta', true, 3);

-- Cada proyecto existente conserva sus tres marcas.
INSERT INTO project_prep(project_id, item_id, done)
SELECT p.id, i.id,
  CASE i.code WHEN 'PL' THEN p.prep_plans WHEN 'MA' THEN p.prep_materials ELSE p.prep_ede END
FROM projects p CROSS JOIN prep_items i
WHERE i.code IN ('PL', 'MA', 'EDE');

ALTER TABLE projects DROP COLUMN prep_plans, DROP COLUMN prep_materials, DROP COLUMN prep_ede;
