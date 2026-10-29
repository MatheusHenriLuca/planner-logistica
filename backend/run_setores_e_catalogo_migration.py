"""Migration script to add setor, catalogo de ferramentas, and setor permissions."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

from app.db.session import SessionLocal, Base, engine
from app.models.ferramentaria import CatalogoFerramenta, ManutencaoFerramenta
from app.models.producao import ColunaExtra, ItemProducao, ItemProducaoStaging
from app.models.perfil import Cargo

db = SessionLocal()
try:
    print("Iniciando migração de banco de dados...")

    # 1. Colunas pode_ver_solda e pode_ver_estamparia em cargos
    for col in ("pode_ver_solda", "pode_ver_estamparia"):
        res = db.execute(text(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name = 'cargos' AND column_name = '{col}'"
        )).fetchone()
        if not res:
            print(f"Adicionando coluna {col} em cargos...")
            db.execute(text(f"ALTER TABLE cargos ADD COLUMN {col} BOOLEAN NOT NULL DEFAULT TRUE"))
            db.commit()

    # 2. Coluna tipo_manutencao em ferramentaria_manutencoes
    res = db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'ferramentaria_manutencoes' AND column_name = 'tipo_manutencao'"
    )).fetchone()
    if not res:
        print("Adicionando coluna tipo_manutencao em ferramentaria_manutencoes...")
        db.execute(text(
            "ALTER TABLE ferramentaria_manutencoes ADD COLUMN tipo_manutencao VARCHAR(30) NOT NULL DEFAULT 'corretiva'"
        ))
        db.commit()

    # 3. Coluna setor em producao, producao_staging e coluna_extra
    for tbl, default_val in [
        ("producao", "solda"),
        ("producao_staging", "solda"),
        ("coluna_extra", "todos"),
    ]:
        res = db.execute(text(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name = '{tbl}' AND column_name = 'setor'"
        )).fetchone()
        if not res:
            print(f"Adicionando coluna setor em {tbl}...")
            db.execute(text(f"ALTER TABLE {tbl} ADD COLUMN setor VARCHAR(30) NOT NULL DEFAULT '{default_val}'"))
            db.commit()

    # 4. Criar tabela ferramentaria_catalogo se não existir
    Base.metadata.create_all(engine, tables=[CatalogoFerramenta.__table__])
    print("Tabela ferramentaria_catalogo verificada/criada.")

    # 5. Criar novos cargos padrão para operadores se não existirem
    cargos_novos = [
        ("operador_solda", "Operador dedicado ao setor de Solda", True, False),
        ("operador_estamparia", "Operador dedicado ao setor de Estamparia", False, True),
    ]
    for nome_cargo, desc, ver_solda, ver_estamparia in cargos_novos:
        cargo_existente = db.query(Cargo).filter_by(nome=nome_cargo).first()
        if not cargo_existente:
            print(f"Criando cargo {nome_cargo}...")
            c = Cargo(
                nome=nome_cargo,
                descricao=desc,
                is_sistema=True,
                pode_programar=False,
                pode_iniciar_producao=True,
                pode_reordenar_producao=False,
                pode_mover_colunas=False,
                pode_gerenciar_colunas=False,
                pode_ver_historico=False,
                pode_gerenciar_usuarios=False,
                pode_importar_sap=False,
                pode_configurar_parametros=False,
                pode_gerenciar_ferramentaria=False,
                pode_ver_solda=ver_solda,
                pode_ver_estamparia=ver_estamparia,
            )
            db.add(c)
            db.commit()

    # 6. Semeando ferramentas de exemplo no catálogo da Ferramentaria se tabela estiver vazia
    qtd_catalogo = db.query(CatalogoFerramenta).count()
    if qtd_catalogo == 0:
        print("Semeando catálogo de ferramentas com preventivas...")
        agora = datetime.now(timezone.utc)
        ferramentas_exemplo = [
            CatalogoFerramenta(
                codigo="EST-MAT-001",
                descricao="Matriz de Repuxo e Corte Capô",
                setor="estamparia",
                linha="LINHA 1",
                posto_trabalho="PRENSA 01",
                periodicidade_dias=30,
                ultima_manutencao=agora - timedelta(days=35),
                proxima_manutencao=agora - timedelta(days=5),  # VENCIDA!
                observacoes="Verificar folgas e punções de corte.",
                ativo=True,
            ),
            CatalogoFerramenta(
                codigo="EST-MAT-002",
                descricao="Estampos Laterais Direita/Esquerda",
                setor="estamparia",
                linha="LINHA 1",
                posto_trabalho="PRENSA 02",
                periodicidade_dias=45,
                ultima_manutencao=agora - timedelta(days=42),
                proxima_manutencao=agora + timedelta(days=3),  # PRÓXIMA (3 dias)!
                observacoes="Revisão dos pinos guia e lubrificação.",
                ativo=True,
            ),
            CatalogoFerramenta(
                codigo="EST-MAT-003",
                descricao="Matriz de Conformação Assoalho",
                setor="estamparia",
                linha="LINHA 2",
                posto_trabalho="PRENSA 03",
                periodicidade_dias=60,
                ultima_manutencao=agora - timedelta(days=10),
                proxima_manutencao=agora + timedelta(days=50),  # EM DIA!
                observacoes="Inspeção trimestral geral.",
                ativo=True,
            ),
            CatalogoFerramenta(
                codigo="SOL-DISP-001",
                descricao="Dispositivo de Solda Robótica Travessa",
                setor="solda",
                linha="LINHA 1",
                posto_trabalho="SOLDA 01",
                periodicidade_dias=30,
                ultima_manutencao=agora - timedelta(days=15),
                proxima_manutencao=agora + timedelta(days=15),  # EM DIA!
                observacoes="Revisão de eletrodos e cabos de massa.",
                ativo=True,
            ),
        ]
        for f in ferramentas_exemplo:
            db.add(f)
        db.commit()
        print("Catálogo de ferramentas semeado com sucesso!")

    # 7. Semeando itens de demonstração para Estamparia na Tabela B se não houver
    qtd_estamparia = db.query(ItemProducao).filter_by(setor="estamparia").count()
    if qtd_estamparia == 0:
        print("Semeando itens de produção para Estamparia...")
        itens_estamparia = [
            ItemProducao(
                setor="estamparia",
                material="EST-MAT-001",
                linha="LINHA 1",
                turno=1,
                patan="A",
                posto_trabalho="PRENSA 01",
                status=2,
                sequencia=1,
                kanbans=4,
                qtd_por_kanban=50,
                tempo_por_peca_minutos=0.5,
                saldo_estoque=1200,
                kanban_max=2000,
                kanban_min=400,
                em_producao=False,
            ),
            ItemProducao(
                setor="estamparia",
                material="EST-MAT-002",
                linha="LINHA 1",
                turno=1,
                patan="A",
                posto_trabalho="PRENSA 01",
                status=2,
                sequencia=2,
                kanbans=6,
                qtd_por_kanban=40,
                tempo_por_peca_minutos=0.6,
                saldo_estoque=800,
                kanban_max=1600,
                kanban_min=300,
                em_producao=False,
            ),
            ItemProducao(
                setor="estamparia",
                material="EST-MAT-003",
                linha="LINHA 1",
                turno=1,
                patan="A",
                posto_trabalho="PRENSA 02",
                status=2,
                sequencia=1,
                kanbans=5,
                qtd_por_kanban=60,
                tempo_por_peca_minutos=0.4,
                saldo_estoque=950,
                kanban_max=1800,
                kanban_min=350,
                em_producao=False,
            ),
        ]
        for it in itens_estamparia:
            db.add(it)
        db.commit()
        print("Itens de produção para Estamparia semeados com sucesso!")

    print("Migração concluída com sucesso absoluto!")
except Exception as e:
    db.rollback()
    print(f"Erro na migração: {e}")
    raise
finally:
    db.close()
