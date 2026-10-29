"""Migration script to add tryout fields to ferramentaria_manutencoes."""
from sqlalchemy import text

from app.db.session import SessionLocal, Base, engine
from app.models.ferramentaria import ManutencaoFerramenta

db = SessionLocal()
try:
    print("Iniciando migração para campos de Tryout na Ferramentaria...")

    novas_colunas = [
        ("tryout_setor", "VARCHAR(30)"),
        ("tryout_prensa", "VARCHAR(100)"),
        ("tryout_ferramenta", "VARCHAR(100)"),
        ("tryout_inicio", "TIMESTAMP"),
        ("tryout_fim", "TIMESTAMP"),
    ]

    for col, tipo in novas_colunas:
        res = db.execute(text(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name = 'ferramentaria_manutencoes' AND column_name = '{col}'"
        )).fetchone()
        if not res:
            print(f"Adicionando coluna {col} em ferramentaria_manutencoes...")
            db.execute(text(f"ALTER TABLE ferramentaria_manutencoes ADD COLUMN {col} {tipo} NULL"))
            db.commit()
            print(f"Coluna {col} adicionada.")
        else:
            print(f"Coluna {col} já existe.")

    # Garante que tabela existe caso nova base
    Base.metadata.create_all(engine, tables=[ManutencaoFerramenta.__table__])

    print("Migração de campos de Tryout concluída com sucesso!")
except Exception as e:
    db.rollback()
    print(f"Erro na migração: {e}")
    raise
finally:
    db.close()
