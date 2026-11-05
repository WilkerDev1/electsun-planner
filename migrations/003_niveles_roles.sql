-- v0.4 (docs/REQUISITOS.md): niveles configurables (NIV-01) y roles con vigencia (EQP-01b, EQP-03b).
-- 001 y 002 no se tocan. `employees.level` y `teams.lead_employee_id` se conservan como copia del nivel principal y del
-- encargado vigentes hoy (la API los calcula con la fecha de hoy; el servidor los mantiene al escribir).

-- ---------- Catálogo de niveles ----------

CREATE TABLE levels (
  id uuid PRIMARY KEY,
  code varchar(24) NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{2,24}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  group_label text NOT NULL CHECK (length(group_label) BETWEEN 1 AND 60),
  sort integer NOT NULL DEFAULT 0,
  fg text NOT NULL CHECK (fg ~ '^#[0-9A-Fa-f]{6}$'),
  bg text NOT NULL CHECK (bg ~ '^#[0-9A-Fa-f]{6}$'),
  border text NOT NULL CHECK (border ~ '^#[0-9A-Fa-f]{6}$'),
  icon text NOT NULL DEFAULT 'user' CHECK (icon IN ('shield', 'flag', 'wrench', 'user', 'building')),
  -- Los cuatro permisos operativos del empleado (las cuentas web siguen aparte, en users.role).
  can_lead_team boolean NOT NULL DEFAULT false,
  is_supervisor boolean NOT NULL DEFAULT false,
  can_use_mobile boolean NOT NULL DEFAULT false,
  is_field boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX levels_name_unique ON levels (lower(name));

-- Los cinco niveles de siempre, con los colores e iconos que tenía la tabla de Empleados.
INSERT INTO levels(id, code, name, group_label, sort, fg, bg, border, icon, can_lead_team, is_supervisor, can_use_mobile, is_field) VALUES
  (gen_random_uuid(), 'supervisor', 'Supervisor', 'Supervisión', 1, '#1F2A3D', '#E8ECF2', '#D5DBE5', 'shield', true, true, true, false),
  (gen_random_uuid(), 'encargado', 'Encargado', 'Encargados de equipo', 2, '#3538CD', '#EEF0FE', '#DCE0FC', 'flag', true, false, true, true),
  (gen_random_uuid(), 'tecnico', 'Técnico', 'Técnicos', 3, '#344054', '#FFFFFF', '#EAECF0', 'wrench', false, false, true, true),
  (gen_random_uuid(), 'ayudante', 'Ayudante', 'Ayudantes', 4, '#344054', '#FFFFFF', '#EAECF0', 'user', false, false, true, true),
  (gen_random_uuid(), 'oficina', 'Oficina', 'Oficina', 5, '#344054', '#FFFFFF', '#EAECF0', 'building', false, false, false, false);

-- ---------- Roles con vigencia ----------

CREATE TABLE employee_roles (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
  -- Equipo que lidera durante la vigencia (solo si el nivel puede liderar).
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  starts_on date NOT NULL,
  ends_on date,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 120),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX employee_roles_employee ON employee_roles(employee_id, starts_on DESC);
CREATE INDEX employee_roles_team ON employee_roles(team_id, starts_on, ends_on);
CREATE INDEX employee_roles_level ON employee_roles(level_id);

-- Cada empleado conserva su nivel de hoy como un rol sin fecha de fin. Si es el encargado de un equipo, el rol lleva ese equipo.
INSERT INTO employee_roles(id, employee_id, level_id, team_id, starts_on, ends_on)
SELECT gen_random_uuid(), e.id, l.id,
  CASE WHEN l.can_lead_team THEN (SELECT t.id FROM teams t WHERE t.lead_employee_id = e.id ORDER BY length(t.code), t.code LIMIT 1) END,
  e.created_at::date, NULL
FROM employees e JOIN levels l ON l.name = e.level;

-- Quien lideraba más de un equipo recibe un rol por cada equipo adicional.
INSERT INTO employee_roles(id, employee_id, level_id, team_id, starts_on, ends_on)
SELECT gen_random_uuid(), e.id, l.id, t.id, e.created_at::date, NULL
FROM teams t
JOIN employees e ON e.id = t.lead_employee_id
JOIN levels l ON l.name = e.level AND l.can_lead_team
WHERE NOT EXISTS (SELECT 1 FROM employee_roles r WHERE r.employee_id = e.id AND r.team_id = t.id);

-- El nivel deja de ser una lista fija: `employees.level` guarda el nombre del nivel principal vigente.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_level_check;
ALTER TABLE employees ADD CONSTRAINT employees_level_len CHECK (length(level) BETWEEN 1 AND 40);
