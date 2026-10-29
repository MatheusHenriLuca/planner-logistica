"""Migration script to add inicio_real, fim_real, quantidade_produzida_real and motivo_interrupcao in producao table."""
from sqlalchemy import text
from app.db.session import SessionLocal

db = SessionLocal()
try:
    print("Iniciando migracao Seisan Kaniban...")
    colunas = [
        ("inicio_real", "TIMESTAMP NULL"),
        ("fim_real", "TIMESTAMP NULL"),
        ("quantidade_produzida_real", "INTEGER NULL"),
        ("motivo_interrupcao", "VARCHAR(50) NULL"),
    ]
    for col, col_type in colunas:
        res = db.execute(text(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name = 'producao' AND column_name = '{col}'"
        )).fetchone()
        if not res:
            print(f"Adicionando coluna {col} em producao...")
            db.execute(text(f"ALTER TABLE producao ADD COLUMN {col} {col_type}"))
            db.commit()
        else:
            print(f"Coluna {col} ja existe em producao.")
    print("Migracao Seisan Kaniban concluida com sucesso!")
except Exception as e:
    print(f"Erro na migracao: {e}")
    db.rollback()
finally:
    db.close()
