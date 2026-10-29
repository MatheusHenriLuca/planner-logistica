-- Migration: Add usuario_id + material to staging, material to producao
-- Run against the existing PostgreSQL planner_logistica database.
--
-- Staging is a temporary buffer, safe to truncate before adding NOT NULL
-- columns. Producao (Tabela B) gets material with a DEFAULT for existing rows.

BEGIN;

-- 1. Staging: wipe buffer (it's a temp buffer, nothing permanent lost)
TRUNCATE TABLE producao_staging;

-- 2. Staging: add new columns
ALTER TABLE producao_staging
    ADD COLUMN usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE producao_staging
    ADD COLUMN material VARCHAR(50) NOT NULL DEFAULT '';

-- 3. Staging: add unique constraint for per-programmer dedup
ALTER TABLE producao_staging
    ADD CONSTRAINT uq_staging_usuario_linha_turno_patan_posto_material
    UNIQUE (usuario_id, linha, turno, patan, posto_trabalho, material);

-- 4. Producao (Tabela B): add material with default for existing rows
ALTER TABLE producao
    ADD COLUMN material VARCHAR(50) NOT NULL DEFAULT '';

COMMIT;
