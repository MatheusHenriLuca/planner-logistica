"""Migration to create ferramentaria_manutencoes and add pode_gerenciar_ferramentaria to cargos."""
from sqlalchemy import text

from app.db.session import SessionLocal, Base, engine
from app.models.user import User
from app.models.ferramentaria import ManutencaoFerramenta
from app.models.perfil import Cargo
from app.repositories.parametro_repository import seed_parametros_e_cargos_padrao

db = SessionLocal()
try:
    # 1. Add pode_gerenciar_ferramentaria to cargos if not exists
    result = db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'cargos' AND column_name = 'pode_gerenciar_ferramentaria'"
    )).fetchone()
    if not result:
        print("Adding pode_gerenciar_ferramentaria column to cargos...")
        db.execute(text(
            "ALTER TABLE cargos ADD COLUMN pode_gerenciar_ferramentaria BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        db.commit()
        print("Column added to cargos.")
    else:
        print("Column pode_gerenciar_ferramentaria already exists in cargos.")

    # 2. Create ferramentaria_manutencoes table if not exists
    Base.metadata.create_all(engine, tables=[ManutencaoFerramenta.__table__])
    print("Table ferramentaria_manutencoes checked/created.")

    # 3. Seed default cargos and parameters
    seed_parametros_e_cargos_padrao(db)
    print("Default cargos and parameters seeded.")

    # Ensure admin has pode_gerenciar_ferramentaria = True
    db.execute(text(
        "UPDATE cargos SET pode_gerenciar_ferramentaria = TRUE WHERE nome IN ('admin', 'programador_ferramentaria')"
    ))
    db.commit()
    print("Migration finished successfully!")
except Exception as e:
    db.rollback()
    print(f"Error during migration: {e}")
    raise
finally:
    db.close()
