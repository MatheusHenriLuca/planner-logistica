import sys
import os
import sqlite3
import re

sql_file = os.path.abspath('docker/initdb/01_init.sql')
backend_dir = os.path.abspath('backend')
db_file = os.path.join(backend_dir, 'planner_logistica.db')

if os.path.exists(db_file):
    os.remove(db_file)

sys.path.insert(0, backend_dir)
os.environ['DATABASE_URL'] = f'sqlite:///{db_file}'
os.environ['JWT_SECRET_KEY'] = '10f9919deb23ef2dabd560f2f107440b58392d0ec80cb701ca64f75d5dde79b3'

from app.db.session import engine, Base
from app.models import audit_log, colaboracao, ferramentaria, parametro, perfil, producao, user
Base.metadata.create_all(bind=engine)
print('Base schema created in SQLite!')

conn = sqlite3.connect(db_file)
cursor = conn.cursor()

with open(sql_file, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

in_copy = False
table_name = ''
columns = []
rows = []

for line in lines:
    line_str = line.rstrip('\r\n')
    if line_str.startswith('COPY '):
        m = re.match(r'COPY\s+public\.(\w+)\s*\((.+)\)\s*FROM\s+stdin;', line_str)
        if m:
            in_copy = True
            table_name = m.group(1)
            columns = [c.strip() for c in m.group(2).split(',')]
            rows = []
        continue
    elif in_copy and line_str == r'\.':
        in_copy = False
        if table_name and columns and rows:
            # Check if table exists in SQLite
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
            if cursor.fetchone():
                # Get actual table columns
                cursor.execute(f'PRAGMA table_info("{table_name}")')
                existing_cols = {row[1] for row in cursor.fetchall()}
                valid_cols = []
                valid_indices = []
                for idx, c in enumerate(columns):
                    if c in existing_cols:
                        valid_cols.append(c)
                        valid_indices.append(idx)
                
                filtered_rows = []
                for r in rows:
                    filtered_rows.append([r[i] for i in valid_indices])

                placeholders = ','.join(['?' for _ in valid_cols])
                col_names = ','.join([f'"{c}"' for c in valid_cols])
                sql = f'INSERT OR REPLACE INTO "{table_name}" ({col_names}) VALUES ({placeholders})'
                cursor.executemany(sql, filtered_rows)
                conn.commit()
                print(f'Imported {len(filtered_rows)} rows into {table_name}')
            else:
                print(f'Skipping table {table_name} (not in schema)')
        table_name = ''
        columns = []
        rows = []
    elif in_copy:
        parts = line_str.split('\t')
        row = []
        for p in parts:
            if p == r'\N':
                row.append(None)
            elif p == 't':
                row.append(1)
            elif p == 'f':
                row.append(0)
            else:
                row.append(p)
        rows.append(row)

conn.close()
print('All initial data imported successfully into SQLite!')
