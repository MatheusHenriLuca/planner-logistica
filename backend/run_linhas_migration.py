"""Migration script to create linhas_producao table and add pode_gerenciar_linhas to cargos."""
from sqlalchemy import text
from app.db.session import SessionLocal

db = SessionLocal()
try:
    print("Iniciando migração de Linhas de Produção e Permissões...")

    # 1. Cria tabela linhas_producao se não existir
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS linhas_producao (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(50) NOT NULL,
            descricao VARCHAR(100) NOT NULL DEFAULT '',
            setor VARCHAR(30) NOT NULL,
            ativo BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT uq_linhas_nome_setor UNIQUE (nome, setor)
        );
    """))
    db.commit()
    print("Tabela linhas_producao verificada/criada.")

    # 2. Adiciona coluna pode_gerenciar_linhas em cargos se não existir
    res = db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'cargos' AND column_name = 'pode_gerenciar_linhas'"
    )).fetchone()
    if not res:
        print("Adicionando coluna pode_gerenciar_linhas em cargos...")
        db.execute(text("ALTER TABLE cargos ADD COLUMN pode_gerenciar_linhas BOOLEAN NOT NULL DEFAULT FALSE"))
        db.commit()
    else:
        print("Coluna pode_gerenciar_linhas já existe em cargos.")

    # Atualiza admin para ter pode_gerenciar_linhas = True
    db.execute(text("UPDATE cargos SET pode_gerenciar_linhas = TRUE WHERE nome = 'admin'"))
    db.commit()

    # 3. Seeds das linhas iniciais solicitadas pelo usuário:
    # Solda: 1, 2, 3
    # Estamparia: 1, 3, 4
    linhas_iniciais = [
        ("LINHA 1", "Linha 1 - Solda", "solda"),
        ("LINHA 2", "Linha 2 - Solda", "solda"),
        ("LINHA 3", "Linha 3 - Solda", "solda"),
        ("LINHA 1", "Linha 1 - Estamparia", "estamparia"),
        ("LINHA 3", "Linha 3 - Estamparia", "estamparia"),
        ("LINHA 4", "Linha 4 - Estamparia", "estamparia"),
    ]

    for nome, desc, setor in linhas_iniciais:
        res = db.execute(text(
            f"SELECT id FROM linhas_producao WHERE nome = '{nome}' AND setor = '{setor}'"
        )).fetchone()
        if not res:
            db.execute(text(
                f"INSERT INTO linhas_producao (nome, descricao, setor, ativo) "
                f"VALUES ('{nome}', '{desc}', '{setor}', TRUE)"
            ))
            print(f"Linha inserida: {nome} ({setor})")

    db.commit()
    print("Migração de Linhas concluída com sucesso!")
except Exception as e:
    print(f"Erro na migração: {e}")
    db.rollback()
finally:
    db.close()
