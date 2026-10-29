from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.colaboracao import Anexo, ChecklistItem, Comentario, ItemProducaoLabel, Label
from app.models.producao import ItemProducao
from app.models.user import User

CHECKLIST_ESTAMPARIA = [
    "(FERRAMENTARIA) FERRAMENTA DISPONÍVEL",
    "(RECEBIMENTO) MATÉRIA PRIMA",
    "(PRODUÇÃO) PRÉ-SETUP",
    "(PRODUÇÃO) FECHAMENTO",
    "(QUALIDADE) LIBERAÇÃO FIM DE PRODUÇÃO",
    "(FERRAMENTARIA) FERRAMENTA LIBERADA",
    "(SAP) LIMPEZA CABECEIRA",
    "(SAP) LIMPEZA WIP1",
]

CHECKLIST_SOLDA = [
    "1 - (ABASTECIMENTO) ESTAMPADO ABASTECIDO",
    "2 - (ABASTECIMENTO) EMBALAGEM E VTOV ABASTECIDOS",
    "3 - (PRODUÇÃO) PRÉ-SETUP",
    "4 - (PRODUÇÃO) FECHAMENTO",
    "5 - LIMPEZA WIP2 OU DTR3",
]

CHECKLIST_PADRAO = CHECKLIST_SOLDA


def item_existe(db: Session, item_producao_id: int) -> bool:
    """Existence check for the collaboration routes' item_id path param -
    without it, POST/PUT against a nonexistent item hits the FK constraint
    as a raw IntegrityError (500) instead of a clean 404.
    """
    return db.get(ItemProducao, item_producao_id) is not None


def listar_checklist(db: Session, item_producao_id: int) -> list[ChecklistItem]:
    stmt = (
        select(ChecklistItem)
        .where(ChecklistItem.item_producao_id == item_producao_id)
        .order_by(ChecklistItem.ordem)
    )
    return list(db.scalars(stmt).all())


def criar_checklist_item(
    db: Session, item_producao_id: int, texto: str, ordem: int
) -> ChecklistItem:
    item = ChecklistItem(item_producao_id=item_producao_id, texto=texto, ordem=ordem)
    db.add(item)
    db.flush()
    return item


def atualizar_checklist_item(
    db: Session,
    checklist_item_id: int,
    texto: str | None = None,
    concluido: bool | None = None,
) -> ChecklistItem | None:
    item = db.get(ChecklistItem, checklist_item_id)
    if item is None:
        return None
    if texto is not None:
        item.texto = texto
    if concluido is not None:
        item.concluido = concluido
    db.flush()
    return item


def remover_checklist_item(db: Session, checklist_item_id: int) -> bool:
    item = db.get(ChecklistItem, checklist_item_id)
    if item is None:
        return False
    db.delete(item)
    db.flush()
    return True


def seed_checklist_padrao(
    db: Session, item_producao_id: int, setor: str | None = None
) -> None:
    """Insert the default checklist steps for a newly created item according to its setor.

    - Estamparia (8 passos oficiais)
    - Solda (5 passos oficiais)
    """
    if setor is None:
        item = db.get(ItemProducao, item_producao_id)
        setor = item.setor if item and item.setor else "solda"

    itens = CHECKLIST_ESTAMPARIA if setor == "estamparia" else CHECKLIST_SOLDA
    for ordem, texto in enumerate(itens, start=1):
        db.add(
            ChecklistItem(
                item_producao_id=item_producao_id,
                texto=texto,
                ordem=ordem,
                concluido=False,
            )
        )
    db.flush()


def redefinir_checklists_para_padrao_setor(
    db: Session, apenas_se_padrao_antigo: bool = True
) -> int:
    """Atualiza checklists de itens de produção existentes de acordo com o setor da tarefa.

    Se apenas_se_padrao_antigo for True, substitui apenas itens cujo checklist contenha
    'Passo 1', 'Passo 2', etc. ou esteja vazio.
    """
    itens = list(db.scalars(select(ItemProducao)).all())
    atualizados = 0

    for item in itens:
        check_existentes = list(
            db.scalars(
                select(ChecklistItem)
                .where(ChecklistItem.item_producao_id == item.id)
                .order_by(ChecklistItem.ordem)
            ).all()
        )
        deve_atualizar = False
        if not check_existentes:
            deve_atualizar = True
        elif apenas_se_padrao_antigo:
            textos = [c.texto for c in check_existentes]
            if any(t.startswith("Passo ") for t in textos):
                deve_atualizar = True

        if deve_atualizar:
            for c in check_existentes:
                db.delete(c)
            db.flush()
            seed_checklist_padrao(db, item.id, setor=item.setor)
            atualizados += 1

    db.commit()
    return atualizados


CATALOGO_PRENSAS_ESTAMPARIA = [
    ("PR-82", "#2563EB"),
    ("PR-92", "#1D4ED8"),
    ("PR-93", "#0284C7"),
    ("PR-97", "#0EA5E9"),
    ("PR-98", "#06B6D4"),
    ("PR-99", "#0D9488"),
    ("PR-108", "#059669"),
    ("PR-109", "#10B981"),
    ("PR-110", "#16A34A"),
    ("PR-113", "#65A30D"),
    ("PR-114", "#CA8A04"),
    ("PR-115", "#D97706"),
    ("PR-116", "#EA580C"),
    ("PRENSA 01", "#4F46E5"),
    ("PRENSA 02", "#7C3AED"),
    ("PRENSA 03", "#9333EA"),
]

CATALOGO_PONTEADEIRAS_SOLDA = [
    ("PONTE 23", "#DB2777"),
    ("PONTE 36", "#C026D3"),
    ("PONTE 37", "#9333EA"),
    ("PONTE 39", "#7C3AED"),
    ("PONTE 41", "#6366F1"),
    ("PONTE 43", "#2563EB"),
    ("PONTE 44", "#0284C7"),
    ("PONTE 47", "#0891B2"),
    ("PONTE 48", "#0D9488"),
    ("PONTE 49", "#059669"),
    ("PONTE 50", "#16A34A"),
    ("PONTE 51", "#65A30D"),
    ("PONTE 52", "#CA8A04"),
    ("PONTE 53", "#D97706"),
    ("PONTE 56", "#EA580C"),
    ("PONTE 57", "#DC2626"),
    ("PONTE 58", "#E11D48"),
    ("PONTE 68", "#475569"),
]



def seed_labels_catalogo(db: Session) -> int:
    """Garante que todas as etiquetas de prensas e ponteadeiras existam no catálogo de labels."""
    todas = CATALOGO_PRENSAS_ESTAMPARIA + CATALOGO_PONTEADEIRAS_SOLDA
    existentes = {l.nome.lower(): l for l in db.scalars(select(Label)).all()}
    criados = 0
    for nome, cor in todas:
        if nome.lower() not in existentes:
            db.add(Label(nome=nome, cor=cor))
            criados += 1
    if criados > 0:
        db.flush()
    return criados


def seed_labels_padrao(db: Session, item_producao_id: int, posto_trabalho: str) -> None:
    """Associa automaticamente a label/etiqueta correspondente à prensa ou ponteadeira ao card."""
    if not posto_trabalho:
        return
    try:
        posto_limpo = posto_trabalho.strip()
        label = db.scalars(
            select(Label).where(func.lower(Label.nome) == func.lower(posto_limpo))
        ).first()
        if label:
            ja_tem = db.scalars(
                select(ItemProducaoLabel).where(
                    ItemProducaoLabel.item_producao_id == item_producao_id,
                    ItemProducaoLabel.label_id == label.id,
                )
            ).first()
            if not ja_tem:
                db.add(ItemProducaoLabel(item_producao_id=item_producao_id, label_id=label.id))
                db.flush()
    except Exception:
        # Silencia em ambientes onde tabelas de label não foram inicializadas (ex: unit tests isolados)
        pass


def atribuir_labels_aos_itens_existentes(db: Session) -> int:
    """Percorre todos os itens de produção e associa a etiqueta do posto/prensa correspondente."""
    seed_labels_catalogo(db)
    labels = {l.nome.lower(): l.id for l in db.scalars(select(Label)).all()}
    itens = db.scalars(select(ItemProducao)).all()
    atribuidos = 0
    for it in itens:
        if it.posto_trabalho and it.posto_trabalho.lower() in labels:
            lbl_id = labels[it.posto_trabalho.lower()]
            ja_tem = db.scalars(
                select(ItemProducaoLabel).where(
                    ItemProducaoLabel.item_producao_id == it.id,
                    ItemProducaoLabel.label_id == lbl_id,
                )
            ).first()
            if not ja_tem:
                db.add(ItemProducaoLabel(item_producao_id=it.id, label_id=lbl_id))
                atribuidos += 1
    db.flush()
    return atribuidos


def atualizar_anotacoes_item(
    db: Session, item_producao_id: int, anotacoes: str, mostrar_no_quadro: bool = False
) -> ItemProducao | None:
    """Atualiza as anotações do programador e a visibilidade no quadro do item."""
    item = db.get(ItemProducao, item_producao_id)
    if not item:
        return None
    item.anotacoes = anotacoes
    item.mostrar_anotacoes_quadro = mostrar_no_quadro
    db.flush()
    return item


def listar_catalogo_labels(db: Session) -> list[Label]:
    return list(db.scalars(select(Label).order_by(Label.id)).all())


def listar_labels_do_item(db: Session, item_producao_id: int) -> list[Label]:
    stmt = (
        select(Label)
        .join(ItemProducaoLabel, ItemProducaoLabel.label_id == Label.id)
        .where(ItemProducaoLabel.item_producao_id == item_producao_id)
        .order_by(Label.id)
    )
    return list(db.scalars(stmt).all())


def substituir_labels_do_item(
    db: Session, item_producao_id: int, label_ids: list[int]
) -> list[Label]:
    """Replace the full set of labels applied to an item (delete then re-insert)."""
    db.execute(
        delete(ItemProducaoLabel).where(
            ItemProducaoLabel.item_producao_id == item_producao_id
        )
    )
    for label_id in label_ids:
        db.add(ItemProducaoLabel(item_producao_id=item_producao_id, label_id=label_id))
    db.flush()
    return listar_labels_do_item(db, item_producao_id)


def listar_comentarios(db: Session, item_producao_id: int) -> list[Comentario]:
    stmt = (
        select(Comentario)
        .where(Comentario.item_producao_id == item_producao_id)
        .order_by(Comentario.criado_em)
    )
    return list(db.scalars(stmt).all())


def criar_comentario(
    db: Session, item_producao_id: int, autor_id: int, texto: str
) -> Comentario:
    comentario = Comentario(item_producao_id=item_producao_id, autor_id=autor_id, texto=texto)
    db.add(comentario)
    db.flush()
    return comentario


def listar_anexos(db: Session, item_producao_id: int) -> list[Anexo]:
    stmt = select(Anexo).where(Anexo.item_producao_id == item_producao_id).order_by(Anexo.id)
    return list(db.scalars(stmt).all())


def criar_anexo(
    db: Session, item_producao_id: int, titulo: str, url: str, enviado_por: int
) -> Anexo:
    anexo = Anexo(
        item_producao_id=item_producao_id, titulo=titulo, url=url, enviado_por=enviado_por
    )
    db.add(anexo)
    db.flush()
    return anexo


def remover_anexo(db: Session, anexo_id: int) -> bool:
    anexo = db.get(Anexo, anexo_id)
    if anexo is None:
        return False
    db.delete(anexo)
    db.flush()
    return True


def obter_usernames(db: Session, user_ids: set[int]) -> dict[int, str]:
    """Batch-resolve {user_id: username} for join-style display fields
    (ComentarioOut.autor_username, AnexoOut.enviado_por_username) - avoids an
    N+1 query per comment/anexo in the route layer.
    """
    if not user_ids:
        return {}
    stmt = select(User.id, User.username).where(User.id.in_(user_ids))
    return dict(db.execute(stmt).all())
