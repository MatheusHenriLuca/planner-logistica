"""Script para sincronização limpa e oficial de comp_comb.
- Solda: Lê de AutomacaoPlanner.xlsx (coluna compComb) e popula fielmente sem invenções.
- Estamparia: Limpa qualquer resquício fictício (como 'BOB-AÇO'), mantendo estritamente vazio
  caso a carga de máquina de prensas não possua BOM explícita.
"""
import openpyxl
from dotenv import load_dotenv

load_dotenv("backend/.env")

from sqlalchemy import text
from app.db.session import SessionLocal


def sincronizar_dados():
    db = SessionLocal()
    try:
        print("=== INICIANDO SINCRONIZAÇÃO OFICIAL DE COMPONENTES ===")

        # 1. Limpar comp_comb fictício da estamparia
        res_st_clean = db.execute(
            text("UPDATE producao_staging SET comp_comb = '' WHERE setor = 'estamparia'")
        )
        res_pr_clean = db.execute(
            text("UPDATE producao SET comp_comb = '' WHERE setor = 'estamparia'")
        )
        print(f"Limpeza de estamparia: {res_st_clean.rowcount} em staging, {res_pr_clean.rowcount} em producao.")

        # 2. Carregar mapeamento legítimo de compComb da Solda
        solda_path = "data/AutomacaoPlanner.xlsx"
        wb_solda = openpyxl.load_workbook(solda_path, data_only=True)
        ws_solda = wb_solda.active
        headers_solda = [cell.value for cell in ws_solda[1]]
        mat_idx = headers_solda.index("Material")
        comp_idx = headers_solda.index("compComb")

        mapping_solda: dict[str, str] = {}
        for row in range(2, ws_solda.max_row + 1):
            mat = ws_solda.cell(row, mat_idx + 1).value
            comp = ws_solda.cell(row, comp_idx + 1).value
            if mat and comp:
                mat_str = str(mat).strip()
                comp_str = str(comp).strip()
                if mat_str and comp_str:
                    mapping_solda[mat_str] = comp_str

        print(f"Mapeamentos oficiais de Solda carregados do Excel: {len(mapping_solda)}")

        # 3. Atualizar tabela producao_staging para solda
        for mat, comp in mapping_solda.items():
            db.execute(
                text(
                    "UPDATE producao_staging SET comp_comb = :comp WHERE setor = 'solda' AND material = :mat"
                ),
                {"comp": comp, "mat": mat},
            )

        # 4. Atualizar tabela producao para solda
        for mat, comp in mapping_solda.items():
            db.execute(
                text(
                    "UPDATE producao SET comp_comb = :comp WHERE setor = 'solda' AND material = :mat"
                ),
                {"comp": comp, "mat": mat},
            )

        db.commit()
        print("=== SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO! ===")
    except Exception as e:
        db.rollback()
        print(f"Erro na sincronização: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sincronizar_dados()
