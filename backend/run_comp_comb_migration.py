"""Migration script to add comp_comb column to producao and producao_staging."""
from sqlalchemy import text
from app.db.session import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        print("=== INICIANDO MIGRAÇÃO DE COMP_COMB ===")
        tabelas = ["producao", "producao_staging"]
        for tab in tabelas:
            res = db.execute(text(
                f"SELECT column_name FROM information_schema.columns "
                f"WHERE table_name = '{tab}' AND column_name = 'comp_comb'"
            )).fetchone()
            if not res:
                print(f"Adicionando coluna comp_comb em {tab}...")
                db.execute(text(f"ALTER TABLE {tab} ADD COLUMN comp_comb TEXT DEFAULT ''"))
                db.commit()
                print(f"Coluna comp_comb adicionada em {tab}.")
            else:
                print(f"Coluna comp_comb já existe em {tab}.")
        print("=== MIGRAÇÃO CONCLUÍDA COM SUCESSO ===")
    except Exception as e:
        db.rollback()
        print(f"Erro na migração: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
