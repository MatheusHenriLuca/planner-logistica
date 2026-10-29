"""Migration script to:
1. Add anotacoes and mostrar_anotacoes_quadro columns to producao and producao_staging.
2. Normalize work centers for Solda (B6420xx -> Ponteadeira xx).
3. Seed labels for all Prensas (Estamparia) and Ponteadeiras (Solda).
4. Auto-assign the corresponding machine label to all existing cards in producao.
"""
from sqlalchemy import text, select
from app.db.session import SessionLocal, Base, engine
from app.models.producao import ItemProducao, ItemProducaoStaging
from app.domain.postos import normalizar_posto_trabalho
from app.repositories.colaboracao_repository import (
    seed_labels_catalogo,
    atribuir_labels_aos_itens_existentes,
)

def run_migration():
    db = SessionLocal()
    try:
        print("=== INICIANDO MIGRAÇÃO DE LABELS, POSTOS E ANOTAÇÕES ===")
        
        # 1. Colunas em producao e producao_staging
        tabelas = ["producao", "producao_staging"]
        colunas = [
            ("anotacoes", "TEXT DEFAULT ''"),
            ("mostrar_anotacoes_quadro", "BOOLEAN DEFAULT FALSE NOT NULL"),
        ]
        
        for tab in tabelas:
            for col, tipo in colunas:
                res = db.execute(text(
                    f"SELECT column_name FROM information_schema.columns "
                    f"WHERE table_name = '{tab}' AND column_name = '{col}'"
                )).fetchone()
                if not res:
                    print(f"Adicionando coluna {col} em {tab}...")
                    db.execute(text(f"ALTER TABLE {tab} ADD COLUMN {col} {tipo}"))
                    db.commit()
                    print(f"Coluna {col} adicionada em {tab}.")
                else:
                    print(f"Coluna {col} já existe em {tab}.")

        # 2. Normalizar postos da Solda (B6420xx -> Ponteadeira xx)
        print("\n--- Normalizando postos de trabalho da Solda (B6420xx -> Ponteadeira xx) ---")
        itens_prod = list(db.scalars(select(ItemProducao)).all())
        atualizados_prod = 0
        for it in itens_prod:
            novo_posto = normalizar_posto_trabalho(it.posto_trabalho, setor=it.setor)
            if novo_posto != it.posto_trabalho:
                it.posto_trabalho = novo_posto
                atualizados_prod += 1

        itens_stg = list(db.scalars(select(ItemProducaoStaging)).all())
        atualizados_stg = 0
        for it in itens_stg:
            novo_posto = normalizar_posto_trabalho(it.posto_trabalho, setor=it.setor)
            if novo_posto != it.posto_trabalho:
                it.posto_trabalho = novo_posto
                atualizados_stg += 1
        
        db.commit()
        print(f"Postos normalizados: {atualizados_prod} em producao, {atualizados_stg} em staging.")

        # 3. Seed de labels para Prensas e Ponteadeiras
        print("\n--- Seeding de etiquetas no catálogo de labels ---")
        novas_labels = seed_labels_catalogo(db)
        db.commit()
        print(f"{novas_labels} novas etiquetas criadas no catálogo de labels.")

        # 4. Atribuir labels correspondentes às prensas/ponteadeiras para todos os cards existentes
        print("\n--- Associando etiquetas aos cards persistidos na produção ---")
        atribuidas = atribuir_labels_aos_itens_existentes(db)
        db.commit()
        print(f"{atribuidas} associações de etiquetas aos itens realizadas com sucesso.")

        print("\n=== MIGRAÇÃO CONCLUÍDA COM SUCESSO! ===")

    except Exception as exc:
        db.rollback()
        print(f"Erro na migração: {exc}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
