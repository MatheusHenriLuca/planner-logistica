from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.parametro import ParametroSistema
from app.models.perfil import Cargo
from app.schemas.perfil import CargoCreate, CargoUpdate


def seed_parametros_e_cargos_padrao(db: Session) -> None:
    """Garante a existência dos cargos e parâmetros padrão do sistema."""
    # 1. Cargos padrão
    cargos_padrao = [
        {
            "nome": "admin",
            "descricao": "Administrador com acesso total a todas as funções e configurações.",
            "is_sistema": True,
            "pode_programar": True,
            "pode_iniciar_producao": True,
            "pode_reordenar_producao": True,
            "pode_mover_colunas": True,
            "pode_gerenciar_colunas": True,
            "pode_ver_historico": True,
            "pode_gerenciar_usuarios": True,
            "pode_importar_sap": True,
            "pode_configurar_parametros": True,
            "pode_gerenciar_ferramentaria": True,
            "pode_gerenciar_linhas": True,
        },
        {
            "nome": "programador",
            "descricao": "Planejamento e sequenciamento de produção, envio de lotes e importação SAP.",
            "is_sistema": True,
            "pode_programar": True,
            "pode_iniciar_producao": True,
            "pode_reordenar_producao": True,
            "pode_mover_colunas": True,
            "pode_gerenciar_colunas": True,
            "pode_ver_historico": False,
            "pode_gerenciar_usuarios": False,
            "pode_importar_sap": True,
            "pode_configurar_parametros": False,
            "pode_gerenciar_ferramentaria": False,
        },
        {
            "nome": "usuario_comum",
            "descricao": "Operador de produção de fábrica para acompanhamento e execução de ordens.",
            "is_sistema": True,
            "pode_programar": False,
            "pode_iniciar_producao": True,
            "pode_reordenar_producao": False,
            "pode_mover_colunas": False,
            "pode_gerenciar_colunas": False,
            "pode_ver_historico": False,
            "pode_gerenciar_usuarios": False,
            "pode_importar_sap": False,
            "pode_configurar_parametros": False,
            "pode_gerenciar_ferramentaria": False,
        },
        {
            "nome": "programador_ferramentaria",
            "descricao": "Programador da Ferramentaria para gestão de manutenção, tryout e liberação de ferramentas.",
            "is_sistema": True,
            "pode_programar": False,
            "pode_iniciar_producao": False,
            "pode_reordenar_producao": False,
            "pode_mover_colunas": False,
            "pode_gerenciar_colunas": False,
            "pode_ver_historico": False,
            "pode_gerenciar_usuarios": False,
            "pode_importar_sap": False,
            "pode_configurar_parametros": False,
            "pode_gerenciar_ferramentaria": True,
        },
    ]

    for dados in cargos_padrao:
        existente = db.scalar(select(Cargo).where(Cargo.nome == dados["nome"]))
        if not existente:
            db.add(Cargo(**dados))

    # 2. Parâmetros padrão
    parametros_padrao = [
        {
            "chave": "bloquear_arraste_producao",
            "valor": "true",
            "descricao": "Desabilitar arraste manual (drag-and-drop) dos cards na tela de Produção. Os operadores utilizam os botões 'Iniciar Produção' e 'Produção Concluída'.",
            "tipo": "boolean",
        },
        {
            "chave": "cor_destaque_producao",
            "valor": "emerald",
            "descricao": "Cor do destaque visual e brilho do card quando em produção ('emerald' para verde ou 'blue' para azul).",
            "tipo": "string",
        },
        {
            "chave": "hora_inicio_turno_1",
            "valor": "06:20",
            "descricao": "Horário padrão de início do 1º Turno (formato HH:MM) para alinhamento da cascata de sequenciamento.",
            "tipo": "string",
        },
        {
            "chave": "hora_inicio_turno_2",
            "valor": "14:40",
            "descricao": "Horário padrão de início do 2º Turno (formato HH:MM) para alinhamento da cascata de sequenciamento.",
            "tipo": "string",
        },
        {
            "chave": "hora_inicio_turno_3",
            "valor": "23:00",
            "descricao": "Horário padrão de início do 3º Turno (formato HH:MM) para alinhamento da cascata de sequenciamento.",
            "tipo": "string",
        },
        {
            "chave": "duracao_refeicao_minutos",
            "valor": "40",
            "descricao": "Duração em minutos somada à hora final do lote ao cruzar a janela de almoço/refeição do turno (+40min).",
            "tipo": "integer",
        },
        {
            "chave": "hora_refeicao_turno_1",
            "valor": "10:20",
            "descricao": "Horário padrão de início do almoço no 1º Turno (formato HH:MM) para inserção da pausa na cascata e no Seisan Kanriban.",
            "tipo": "string",
        },
        {
            "chave": "hora_refeicao_turno_2",
            "valor": "18:40",
            "descricao": "Horário padrão de início do almoço/jantar no 2º Turno (formato HH:MM) para inserção da pausa na cascata e no Seisan Kanriban.",
            "tipo": "string",
        },
        {
            "chave": "hora_refeicao_turno_3",
            "valor": "03:00",
            "descricao": "Horário padrão de início da ceia/refeição no 3º Turno (formato HH:MM) para inserção da pausa na cascata e no Seisan Kanriban.",
            "tipo": "string",
        },
        {
            "chave": "tolerancia_atraso_seisan_min",
            "valor": "15",
            "descricao": "Tolerância limite em minutos para disparar alerta visual de atraso operacional no Seisan Kanriban.",
            "tipo": "integer",
        },
        {
            "chave": "bloquear_envio_ferramenta_manutencao",
            "valor": "true",
            "descricao": "Bloqueio rígido de envio: rejeita novos lotes caso ferramentas correspondentes estejam em manutenção.",
            "tipo": "boolean",
        },
        {
            "chave": "exigir_motivo_quebra",
            "valor": "true",
            "descricao": "Exigir preenchimento obrigatório da descrição detalhada e motivo ao apontar quebra no chão de fábrica.",
            "tipo": "boolean",
        },
        {
            "chave": "dias_alerta_preventiva",
            "valor": "7",
            "descricao": "Janela de dias de antecedência para exibir alerta semafórico de preventiva próxima no Catálogo de Ferramentas.",
            "tipo": "integer",
        },
        {
            "chave": "tempo_padrao_setup_minutos",
            "valor": "10",
            "descricao": "Tempo padrão de troca e ajuste de matriz/ferramenta (SMED) estimado em minutos entre ordens consecutivas.",
            "tipo": "integer",
        },
        {
            "chave": "limite_max_kanbans_emergencia",
            "valor": "50",
            "descricao": "Quantidade máxima permitida de Kanbans ao inserir uma ordem de emergência direta na produção.",
            "tipo": "integer",
        },
        {
            "chave": "limite_lote_curto_minutos",
            "valor": "60",
            "descricao": "Tempo mínimo planejado em minutos para ordens da Estamparia (prensas). Lotes abaixo desse limite disparam alerta de Lote Curto exclusivamente na tela de Programação.",
            "tipo": "integer",
        },
        {
            "chave": "limite_lote_curto_solda_minutos",
            "valor": "60",
            "descricao": "Tempo mínimo planejado em minutos para ordens da Solda (ponteadeiras/células). Lotes abaixo desse limite disparam alerta de Lote Curto exclusivamente na tela de Programação.",
            "tipo": "integer",
        },
        {
            "chave": "template_resumo_solda",
            "valor": '[{"id":"horarios","ativo":true},{"id":"duracao","ativo":true},{"id":"totais","ativo":true},{"id":"material","ativo":true},{"id":"dados_lote","ativo":true},{"id":"componentes_solda","ativo":true},{"id":"observacoes","ativo":true}]',
            "descricao": "Template JSON configurável com a lista e ordem dos blocos de informações para preenchimento rápido de anotações no setor de Solda.",
            "tipo": "string",
        },
        {
            "chave": "template_resumo_estamparia",
            "valor": '[{"id":"horarios","ativo":true},{"id":"duracao","ativo":true},{"id":"totais","ativo":true},{"id":"material","ativo":true},{"id":"paletizacao_estamparia","ativo":true},{"id":"materia_prima_estamparia","ativo":true},{"id":"ferramenta_estamparia","ativo":true},{"id":"dados_lote","ativo":true},{"id":"observacoes","ativo":true}]',
            "descricao": "Template JSON configurável com a lista e ordem dos blocos de informações para preenchimento rápido de anotações no setor de Estamparia.",
            "tipo": "string",
        },

        {
            "chave": "margem_seguranca_estoque_pct",
            "valor": "15",
            "descricao": "Margem percentual de estoque de segurança (%) para sinalização preventiva de alerta antes de ruptura.",
            "tipo": "integer",
        },
        {
            "chave": "intervalo_refresh_automatico_seg",
            "valor": "30",
            "descricao": "Intervalo em segundos para polling/atualização automática de dados em segundo plano nas telas de fábrica.",
            "tipo": "integer",
        },
        {
            "chave": "exibir_segundos_cronometro",
            "valor": "true",
            "descricao": "Exibir precisão com segundos nos cronômetros de lotes em andamento ao vivo e nos apontamentos.",
            "tipo": "boolean",
        },
        {
            "chave": "notificar_parada_maquina_lideranca",
            "valor": "true",
            "descricao": "Notificar imediatamente a liderança e supervisão operacional ao apontar quebra de máquina ou ferramenta.",
            "tipo": "boolean",
        },
        {
            "chave": "tolerancia_tryout_horas",
            "valor": "4",
            "descricao": "Tempo máximo recomendado em horas para execução de testes práticos de Tryout em prensa antes do laudo.",
            "tipo": "integer",
        },
        {
            "chave": "habilitar_sons_apontamento",
            "valor": "true",
            "descricao": "Habilitar alertas sonoros ao concluir apontamento de lote ou registrar ocorrências de avaria.",
            "tipo": "boolean",
        },
        {
            "chave": "comando_atualizacao_sap",
            "valor": r"C:\Users\sb2mcontinua\Desktop\MAIN_SAP.bat",
            "descricao": "Comando ou script executado diretamente no PC servidor para extração e sincronização dos dados do SAP GUI (MB52 / ERP).",
            "tipo": "string",
        },
    ]

    for param in parametros_padrao:
        existente = db.scalar(select(ParametroSistema).where(ParametroSistema.chave == param["chave"]))
        if not existente:
            db.add(ParametroSistema(**param))

    db.flush()


def listar_cargos(db: Session) -> list[Cargo]:
    return list(db.scalars(select(Cargo).order_by(Cargo.id)).all())


def obter_cargo(db: Session, cargo_id: int) -> Cargo | None:
    return db.get(Cargo, cargo_id)


def obter_cargo_por_nome(db: Session, nome: str) -> Cargo | None:
    return db.scalar(select(Cargo).where(Cargo.nome == nome))


def criar_cargo(db: Session, payload: CargoCreate) -> Cargo:
    cargo = Cargo(
        nome=payload.nome.strip().lower(),
        descricao=payload.descricao,
        is_sistema=False,
        pode_programar=payload.pode_programar,
        pode_iniciar_producao=payload.pode_iniciar_producao,
        pode_reordenar_producao=payload.pode_reordenar_producao,
        pode_mover_colunas=payload.pode_mover_colunas,
        pode_gerenciar_colunas=payload.pode_gerenciar_colunas,
        pode_ver_historico=payload.pode_ver_historico,
        pode_gerenciar_usuarios=payload.pode_gerenciar_usuarios,
        pode_importar_sap=payload.pode_importar_sap,
        pode_configurar_parametros=payload.pode_configurar_parametros,
        pode_gerenciar_ferramentaria=payload.pode_gerenciar_ferramentaria,
        pode_gerenciar_linhas=payload.pode_gerenciar_linhas,
    )
    db.add(cargo)
    db.flush()
    return cargo


def atualizar_cargo(db: Session, cargo_id: int, payload: CargoUpdate) -> Cargo | None:
    cargo = db.get(Cargo, cargo_id)
    if not cargo:
        return None

    dados = payload.model_dump(exclude_unset=True)
    # Não permite alterar permissões do admin do sistema para False para evitar lock-out
    if cargo.nome == "admin":
        # admin sempre mantém tudo True
        dados.pop("is_sistema", None)
        for k in dados:
            if k.startswith("pode_"):
                dados[k] = True

    for campo, valor in dados.items():
        setattr(cargo, campo, valor)

    db.flush()
    return cargo


def remover_cargo(db: Session, cargo_id: int) -> bool:
    cargo = db.get(Cargo, cargo_id)
    if not cargo or cargo.is_sistema:
        return False
    db.delete(cargo)
    db.flush()
    return True


def listar_parametros(db: Session) -> list[ParametroSistema]:
    return list(db.scalars(select(ParametroSistema).order_by(ParametroSistema.chave)).all())


def obter_parametro(db: Session, chave: str) -> ParametroSistema | None:
    try:
        parametro = db.get(ParametroSistema, chave)
        if not parametro:
            seed_parametros_e_cargos_padrao(db)
            parametro = db.get(ParametroSistema, chave)
        return parametro
    except Exception:
        return None


def atualizar_parametro(db: Session, chave: str, valor: str) -> ParametroSistema | None:
    parametro = db.get(ParametroSistema, chave)
    if not parametro:
        seed_parametros_e_cargos_padrao(db)
        parametro = db.get(ParametroSistema, chave)
    if not parametro:
        return None
    parametro.valor = valor
    db.flush()
    return parametro

