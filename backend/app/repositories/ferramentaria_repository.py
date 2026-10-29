from datetime import datetime, timedelta, timezone
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.datetime_utils import agora_brasilia

from app.models.ferramentaria import CatalogoFerramenta, ManutencaoFerramenta
from app.schemas.ferramentaria import (
    CatalogoFerramentaCreate,
    CatalogoFerramentaOut,
    CatalogoFerramentaUpdate,
    ManutencaoCreate,
)


def listar_manutencoes(
    db: Session, status: str | None = None, material: str | None = None
) -> list[ManutencaoFerramenta]:
    """Retorna a lista de manutenções de ferramentas registradas."""
    query = select(ManutencaoFerramenta).order_by(ManutencaoFerramenta.data_quebra.desc())
    if status:
        query = query.where(ManutencaoFerramenta.status == status)
    if material:
        query = query.where(ManutencaoFerramenta.material == material)
    return list(db.scalars(query).all())


def listar_materiais_bloqueados(db: Session) -> list[str]:
    """Retorna os códigos de materiais únicos que estão atualmente em manutenção/bloqueados."""
    query = (
        select(ManutencaoFerramenta.material)
        .where(ManutencaoFerramenta.status != "disponivel")
        .distinct()
    )
    materiais = [m.strip() for m in db.scalars(query).all() if m and m.strip()]
    resultado: set[str] = set()
    for mat in materiais:
        resultado.add(mat)
        partes = [p.strip() for p in re.split(r"[/;,\+]", mat) if p.strip()]
        for p in partes:
            resultado.add(p)
    return sorted(resultado)


def criar_manutencao(
    db: Session, data: ManutencaoCreate, usuario_id: int | None = None
) -> ManutencaoFerramenta:
    """Registra uma nova ordem de manutenção/ferramenta na ferramentaria."""
    status_inicial = "aguardando_preventiva" if data.tipo_manutencao == "preventiva" else "aguardando_manutencao"
    manutencao = ManutencaoFerramenta(
        material=data.material,
        descricao=data.descricao,
        linha=data.linha,
        posto_trabalho=data.posto_trabalho,
        status=status_inicial,
        tipo_manutencao=data.tipo_manutencao,
        motivo_quebra=data.motivo_quebra,
        pecas_produzidas=data.pecas_produzidas,
        observacoes=data.observacoes,
        data_quebra=agora_brasilia(),
        usuario_id=usuario_id,
    )
    db.add(manutencao)
    db.commit()
    db.refresh(manutencao)
    return manutencao


def atualizar_status_manutencao(
    db: Session,
    manutencao_id: int,
    status: str,
    observacoes: str | None = None,
    tryout_setor: str | None = None,
    tryout_prensa: str | None = None,
    tryout_ferramenta: str | None = None,
    tryout_inicio: datetime | None = None,
    tryout_fim: datetime | None = None,
) -> ManutencaoFerramenta | None:
    """Atualiza o estágio da ferramenta (aguardando_manutencao, aguardando_preventiva, em_manutencao, aguardando_tryout, tryout, disponivel)."""
    manutencao = db.get(ManutencaoFerramenta, manutencao_id)
    if not manutencao:
        return None

    manutencao.status = status
    if observacoes is not None:
        if manutencao.observacoes:
            manutencao.observacoes += f"\n[{agora_brasilia().strftime('%d/%m %H:%M')}] {observacoes}"
        else:
            manutencao.observacoes = observacoes

    if tryout_setor is not None:
        manutencao.tryout_setor = tryout_setor
    if tryout_prensa is not None:
        manutencao.tryout_prensa = tryout_prensa
    if tryout_ferramenta is not None:
        manutencao.tryout_ferramenta = tryout_ferramenta
    if tryout_inicio is not None:
        manutencao.tryout_inicio = tryout_inicio
    if tryout_fim is not None:
        manutencao.tryout_fim = tryout_fim

    if status == "disponivel":
        agora = agora_brasilia()
        manutencao.data_liberacao = agora

        # Se ferramenta estiver no catálogo de preventivas, atualiza a periodicidade
        ferr = db.scalars(
            select(CatalogoFerramenta).where(CatalogoFerramenta.codigo == manutencao.material)
        ).first()
        if ferr:
            ferr.ultima_manutencao = agora
            ferr.proxima_manutencao = agora + timedelta(days=ferr.periodicidade_dias)

    db.commit()
    db.refresh(manutencao)
    return manutencao


# --- Métodos para Catálogo de Ferramentas & Preventivas ---


def _calcular_status_preventiva(
    ferramenta: CatalogoFerramenta,
) -> tuple[str, int | None]:
    if not ferramenta.proxima_manutencao:
        return "em_dia", None

    agora = agora_brasilia()
    prox = ferramenta.proxima_manutencao
    if prox.tzinfo is not None:
        prox = prox.replace(tzinfo=None)

    delta = prox - agora

    dias = delta.days

    if dias < 0:
        return "vencida", dias
    if dias <= 7:
        return "proxima", dias
    return "em_dia", dias


def listar_catalogo(
    db: Session, setor: str | None = None, busca: str | None = None
) -> list[CatalogoFerramentaOut]:
    """Retorna itens do catálogo com cálculo de dias restantes e semáforo preventivo."""
    query = select(CatalogoFerramenta).order_by(CatalogoFerramenta.codigo)
    if setor:
        query = query.where(CatalogoFerramenta.setor == setor)
    if busca:
        termo = f"%{busca}%"
        query = query.where(
            CatalogoFerramenta.codigo.ilike(termo)
            | CatalogoFerramenta.descricao.ilike(termo)
            | CatalogoFerramenta.posto_trabalho.ilike(termo)
        )

    itens = list(db.scalars(query).all())
    resultado: list[CatalogoFerramentaOut] = []
    for it in itens:
        st, dias = _calcular_status_preventiva(it)
        resultado.append(
            CatalogoFerramentaOut(
                id=it.id,
                codigo=it.codigo,
                descricao=it.descricao,
                setor=it.setor,
                linha=it.linha,
                posto_trabalho=it.posto_trabalho,
                periodicidade_dias=it.periodicidade_dias,
                ultima_manutencao=it.ultima_manutencao,
                proxima_manutencao=it.proxima_manutencao,
                observacoes=it.observacoes,
                ativo=it.ativo,
                status_preventiva=st,
                dias_restantes=dias,
            )
        )
    return resultado


def criar_ferramenta_catalogo(
    db: Session, data: CatalogoFerramentaCreate
) -> CatalogoFerramenta:
    agora = agora_brasilia()
    proxima = agora + timedelta(days=data.periodicidade_dias)
    ferr = CatalogoFerramenta(
        codigo=data.codigo.strip().upper(),
        descricao=data.descricao.strip(),
        setor=data.setor,
        linha=data.linha.strip(),
        posto_trabalho=data.posto_trabalho.strip().upper(),
        periodicidade_dias=data.periodicidade_dias,
        ultima_manutencao=agora,
        proxima_manutencao=proxima,
        observacoes=data.observacoes.strip(),
        ativo=True,
    )
    db.add(ferr)
    db.commit()
    db.refresh(ferr)
    return ferr


def atualizar_ferramenta_catalogo(
    db: Session, catalogo_id: int, data: CatalogoFerramentaUpdate
) -> CatalogoFerramenta | None:
    ferr = db.get(CatalogoFerramenta, catalogo_id)
    if not ferr:
        return None

    if data.descricao is not None:
        ferr.descricao = data.descricao
    if data.setor is not None:
        ferr.setor = data.setor
    if data.linha is not None:
        ferr.linha = data.linha
    if data.posto_trabalho is not None:
        ferr.posto_trabalho = data.posto_trabalho
    if data.periodicidade_dias is not None:
        ferr.periodicidade_dias = data.periodicidade_dias
        base = ferr.ultima_manutencao or agora_brasilia()
        ferr.proxima_manutencao = base + timedelta(days=data.periodicidade_dias)
    if data.observacoes is not None:
        ferr.observacoes = data.observacoes
    if data.ativo is not None:
        ferr.ativo = data.ativo

    db.commit()
    db.refresh(ferr)
    return ferr


def remover_ferramenta_catalogo(db: Session, catalogo_id: int) -> bool:
    ferr = db.get(CatalogoFerramenta, catalogo_id)
    if not ferr:
        return False
    db.delete(ferr)
    db.commit()
    return True


def abrir_preventiva_catalogo(
    db: Session, catalogo_id: int, usuario_id: int | None = None
) -> ManutencaoFerramenta | None:
    ferr = db.get(CatalogoFerramenta, catalogo_id)
    if not ferr:
        return None

    manutencao = ManutencaoFerramenta(
        material=ferr.codigo,
        descricao=ferr.descricao or f"Ferramenta {ferr.codigo}",
        linha=ferr.linha,
        posto_trabalho=ferr.posto_trabalho,
        status="aguardando_preventiva",
        tipo_manutencao="preventiva",
        motivo_quebra=f"Manutenção Preventiva Periódica ({ferr.periodicidade_dias} dias)",
        pecas_produzidas=0,
        observacoes=f"Acionada preventivamente pelo catálogo. {ferr.observacoes}".strip(),
        data_quebra=agora_brasilia(),
        usuario_id=usuario_id,
    )
    db.add(manutencao)
    db.commit()
    db.refresh(manutencao)
    return manutencao

