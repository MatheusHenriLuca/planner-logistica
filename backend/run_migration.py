"""Run the database migration to add usuario_id and material columns."""
from sqlalchemy import text

from app.db.session import SessionLocal

db = SessionLocal()
try:
    # Check if columns already exist in staging
    result = db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'producao_staging' ORDER BY ordinal_position"
    )).fetchall()
    existing = [r[0] for r in result]
    print("Existing staging columns:", existing)

    if "usuario_id" in existing:
        print("Staging migration already applied!")
    else:
        print("Running staging migration...")
        db.execute(text("TRUNCATE TABLE producao_staging"))
        db.execute(text(
            "ALTER TABLE producao_staging "
            "ADD COLUMN usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE"
        ))
        db.execute(text(
            "ALTER TABLE producao_staging "
            "ADD COLUMN material VARCHAR(50) NOT NULL DEFAULT ''"
        ))
        db.execute(text(
            "ALTER TABLE producao_staging "
            "ADD CONSTRAINT uq_staging_usuario_linha_turno_patan_posto_material "
            "UNIQUE (usuario_id, linha, turno, patan, posto_trabalho, material)"
        ))
        print("Staging migration done")

    # Check producao table
    result2 = db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'producao' ORDER BY ordinal_position"
    )).fetchall()
    existing2 = [r[0] for r in result2]
    print("Existing producao columns:", existing2)

    if "material" not in existing2:
        db.execute(text(
            "ALTER TABLE producao ADD COLUMN material VARCHAR(50) NOT NULL DEFAULT ''"
        ))
        print("Producao material column added")
    else:
        print("Producao material column already exists")

    db.commit()
    print("Migration complete!")
except Exception as e:
    db.rollback()
    print(f"Error: {e}")
    raise
finally:
    db.close()
