import os
import sys
from pathlib import Path
from time import sleep

# Garante a importação dos módulos locais (AutoSap, GetDate, TerminateProcess)
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

# Caminho padrão na rede onde a automação do Planner salva o estoque.xlsx
CAMINHO_PADRAO_ESTOQUE = r"\\sb2-fs\4_GESTAO_DA_QUALIDADE$\00_KPI_&_GSD\Melhoria Contínua\APPs\Automação Planner\Estoque"

from AutoSap.sap import Sap  # type: ignore
from GetDate.get_date import get_period  # type: ignore
from TerminateProcess.close_process import encerrar_processos  # type: ignore

terminate = encerrar_processos()
sap = Sap()
get_date = get_period()
dataFormatada = get_date.today_ymd_period()


def sapLogin(login: str, pwd: str) -> bool:
    try:
        sap.open_and_login(login, pwd)
        sleep(3)
        return True
    except Exception:
        for _ in range(3):
            try:
                sleep(3)
                sap.open_and_login(login, pwd)
                sleep(3)
                return True
            except Exception:
                pass
        return False


def updateStock(caminho_destino: str | None = None) -> None:
    destino = caminho_destino or os.environ.get("SAP_ESTOQUE_DIR") or CAMINHO_PADRAO_ESTOQUE

    if sap.sap_aberto(0) == 0:
        print("SAP NÃO ABERTO: iniciando login com SORIP002...")
        user = "SORIP002"
        senha = sap.pd_excel(user)
        sapLogin(user, senha)
    else:
        print("SAP JÁ ABERTO: conectando à sessão existente...")
        sap.get_existing_connection(0)

    sap.get_existing_connection(0)
    print("Acessando transação MB52...")
    sap.enter_transaction("mb52")

    sap.selectField("wnd[0]/usr/chkPA_SOND")  # Set também estoque especial

    sap.notSelectField("wnd[0]/usr/chkNEGATIV")  # Exibir só estoque negativos
    sap.notSelectField("wnd[0]/usr/chkXMCHB")  # Exibir estoque de lotes
    sap.notSelectField("wnd[0]/usr/chkNOZERO")  # Sem linhas estoque zero
    sap.notSelectField("wnd[0]/usr/chkNOVALUES")  # Não exibir valores

    sap.select("wnd[0]/usr/radPA_FLT")  # Representação não hierárquica
    sap.notSelectField("wnd[0]/usr/chkB_FILE")  # B-file

    sap.input_text("wnd[0]/usr/ctxtP_VARI", "sorpcp")  # Layout

    print("Executando consulta (F8)...")
    sap.send_f8_key()

    print(f"Exportando estoque.xlsx para: {destino}")
    sap.select("wnd[0]/mbar/menu[0]/menu[3]/menu[1]")
    sap.press_button("wnd[1]/tbar[0]/btn[0]")
    sap.input_text("wnd[1]/usr/ctxtDY_PATH", destino)
    sap.input_text("wnd[1]/usr/ctxtDY_FILENAME", "estoque.xlsx")
    sap.press_button("wnd[1]/tbar[0]/btn[11]")

    sap.send_esc_key(2)
    sleep(3)
    terminate.sap_logon()
    terminate.excel()
    print("Exportação do MB52 concluída com sucesso.")


if __name__ == "__main__":
    destino_cli = sys.argv[1] if len(sys.argv) > 1 else None
    updateStock(destino_cli)