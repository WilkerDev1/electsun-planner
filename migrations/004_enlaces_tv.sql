-- Enlaces de TV con título, ajustes propios y pausa reversible (ACC-08, MUR-09).
ALTER TABLE access_links
  ADD COLUMN title text,
  ADD COLUMN mural jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN paused boolean NOT NULL DEFAULT false;

ALTER TABLE access_links
  ADD CONSTRAINT access_links_title_len CHECK (title IS NULL OR length(title) BETWEEN 1 AND 60),
  ADD CONSTRAINT access_links_mural_object CHECK (jsonb_typeof(mural) = 'object'),
  -- Título, ajustes propios y pausa solo tienen sentido en las pantallas de TV.
  ADD CONSTRAINT access_links_tv_only CHECK (kind = 'tv' OR (title IS NULL AND mural = '{}'::jsonb AND NOT paused));
