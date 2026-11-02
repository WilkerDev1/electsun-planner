-- Esquema completo de la v1 (docs/REQUISITOS.md §6). No editar tras aplicarse: crear 002_*.sql.

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text,
  role text NOT NULL CHECK (role IN ('admin', 'office')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invitations (
  hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invite', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX invitations_user ON invitations(user_id);

CREATE TABLE companies (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  code char(2) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2}$'),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^E[1-9][0-9]?$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  lead_employee_id uuid,
  color text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  job text NOT NULL DEFAULT '' CHECK (length(job) <= 80),
  level text NOT NULL CHECK (level IN ('Supervisor', 'Encargado', 'Técnico', 'Ayudante', 'Oficina')),
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'Activo' CHECK (state IN ('Activo', 'Vacaciones', 'De baja')),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 30),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employees_team ON employees(team_id);
ALTER TABLE teams ADD CONSTRAINT teams_lead FOREIGN KEY (lead_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE statuses (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
  kind text NOT NULL CHECK (kind IN ('por_programar', 'programado', 'en_obra', 'en_pausa', 'terminado', 'post_obra')),
  sort integer NOT NULL,
  fg text NOT NULL CHECK (fg ~ '^#[0-9A-Fa-f]{6}$'),
  bg text NOT NULL CHECK (bg ~ '^#[0-9A-Fa-f]{6}$'),
  dot text NOT NULL CHECK (dot ~ '^#[0-9A-Fa-f]{6}$'),
  requires_schedule boolean NOT NULL DEFAULT false,
  requires_reason boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lista por defecto (REQUISITOS EST-02, EST-03). Se puede renombrar y recolorear; el tipo es fijo.
INSERT INTO statuses(id, name, kind, sort, fg, bg, dot, requires_schedule, requires_reason) VALUES
  (gen_random_uuid(), 'En obra', 'en_obra', 1, '#095C4F', '#E0F4EF', '#0B7A68', true, false),
  (gen_random_uuid(), 'Programado', 'programado', 2, '#3538CD', '#EEF0FE', '#6172F3', true, false),
  (gen_random_uuid(), 'Por programar', 'por_programar', 3, '#3F4859', '#EFF1F5', '#8B95A7', false, false),
  (gen_random_uuid(), 'En pausa', 'en_pausa', 4, '#A11C47', '#FDECF1', '#D63B6A', false, true),
  (gen_random_uuid(), 'Terminado', 'terminado', 5, '#1F2A3D', '#E8ECF2', '#2B3A55', false, false),
  (gen_random_uuid(), 'Esperando medidor', 'post_obra', 6, '#155E75', '#E3F1F5', '#0E7490', false, false);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  kwp numeric(8, 2) CHECK (kwp IS NULL OR kwp >= 0),
  sale_date date,
  place text NOT NULL DEFAULT '' CHECK (length(place) <= 120),
  lead_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  start_date date,
  estimated_days integer CHECK (estimated_days IS NULL OR estimated_days BETWEEN 1 AND 120),
  end_date date,
  actual_end date,
  status_id uuid NOT NULL REFERENCES statuses(id),
  pause_reason text NOT NULL DEFAULT '' CHECK (length(pause_reason) <= 200),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  show_on_mural boolean NOT NULL DEFAULT false,
  mural_until date,
  priority boolean NOT NULL DEFAULT false,
  part text NOT NULL DEFAULT '' CHECK (length(part) <= 40),
  system_type text NOT NULL DEFAULT 'neta' CHECK (system_type IN ('neta', 'hibrido')),
  prep_plans boolean NOT NULL DEFAULT false,
  prep_materials boolean NOT NULL DEFAULT false,
  prep_ede boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX projects_status ON projects(status_id);
CREATE INDEX projects_team_dates ON projects(team_id, start_date);

CREATE TABLE notices (
  id uuid PRIMARY KEY,
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 140),
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  expires_on date NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on >= starts_on)
);

CREATE TABLE mural_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  design text NOT NULL DEFAULT 'principal' CHECK (design IN ('principal', 'timeline')),
  weeks integer NOT NULL DEFAULT 2 CHECK (weeks IN (2, 3, 4)),
  upcoming_order text NOT NULL DEFAULT 'fecha' CHECK (upcoming_order IN ('fecha', 'prioridad')),
  show_waiting boolean NOT NULL DEFAULT true,
  show_notes boolean NOT NULL DEFAULT true,
  show_priority boolean NOT NULL DEFAULT true,
  show_clock boolean NOT NULL DEFAULT true,
  show_kwp boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO mural_settings(id) VALUES (1);

CREATE TABLE access_links (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('tv', 'mobile')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  token_hash text,
  last_seen_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'mobile') = (employee_id IS NOT NULL)),
  CHECK (NOT active OR token_hash IS NOT NULL)
);
CREATE UNIQUE INDEX access_links_one_mobile ON access_links(employee_id) WHERE kind = 'mobile';

CREATE TABLE device_sessions (
  hash text PRIMARY KEY,
  link_id uuid NOT NULL REFERENCES access_links(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX device_sessions_link ON device_sessions(link_id);

CREATE TABLE audit (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  diff jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity ON audit(entity, entity_id, id DESC);
