from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.producao import LinhaProducao
from app.schemas.linha import LinhaProducaoCreate


def seed_linhas_padrao(db: Session) -> None:
    """Garante a existência das linhas de produção padrão para cada setor."""
    linhas_iniciais = [
        # Linhas de Solda (1, 2 e 3)
        {"nome": "LINHA 1", "descricao": "Linha 1 - Solda", "setor": "solda"},
        {"nome": "LINHA 2", "descricao": "Linha 2 - Solda", "setor": "solda"},
        {"nome": "LINHA 3", "descricao": "Linha 3 - Solda", "setor": "solda"},
        # Linhas de Estamparia (1, 3 e 4)
        {"nome": "LINHA 1", "descricao": "Linha 1 - Estamparia", "setor": "estamparia"},
        {"nome": "LINHA 3", "descricao": "Linha 3 - Estamparia", "setor": "estamparia"},
        {"nome": "LINHA 4", "descricao": "Linha 4 - Estamparia", "setor": "estamparia"},
    ]

    for dados in linhas_iniciais:
        stmt = select(LinhaProducao).where(
            LinhaProducao.nome == dados["nome"],
            LinhaProducao.setor == dados["setor"],
        )
        existente = db.scalar(stmt)
        if not existente:
            db.add(LinhaProducao(**dados))

    db.flush()


def listar_linhas(db: Session, setor: str | None = None) -> list[LinhaProducao]:
    stmt = select(LinhaProducao).where(LinhaProducao.ativo.is_(True))
    if setor is not None:
        stmt = stmt.where(LinhaProducao.setor == setor)
    stmt = stmt.order_by(LinhaProducao.setor, LinhaProducao.nome)
    return list(db.scalars(stmt).all())


def obter_linha_por_id(db: Session, linha_id: int) -> LinhaProducao | None:
    return db.get(LinhaProducao, linha_id)


def obter_linha_por_nome_e_setor(db: Session, nome: str, setor: str) -> LinhaProducao | None:
    stmt = select(LinhaProducao).where(
        LinhaProducao.nome == nome,
        LinhaProducao.setor == setor,
    )
    return db.scalar(stmt)


def criar_linha(db: Session, payload: LinhaProducaoCreate) -> LinhaProducao:
    linha = LinhaProducao(
        nome=payload.nome.strip().upper(),
        descricao=payload.descricao.strip(),
        setor=payload.setor.strip().lower(),
        ativo=True,
    )
    db.add(linha)
    db.flush()
    return linha


def remover_linha(db: Session, linha_id: int) -> bool:
    linha = db.get(LinhaProducao, linha_id)
    if not linha:
        return False
    # Soft delete / desativar para não quebrar integridade histórica
    linha.ativo = False
    db.flush()
    return True
