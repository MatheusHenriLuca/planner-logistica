"""Unit tests for the Excel import service (parsing + mapping only, no DB)."""
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services.excel_import import (
    _is_item_critico,
    _parse_rows,
    _safe_bool,
    _safe_float,
    _safe_int,
    _safe_optional_int,
)


class TestSafeCoercion:
    def test_safe_int_none(self):
        assert _safe_int(None) == 0

    def test_safe_int_empty_string(self):
        assert _safe_int("") == 0

    def test_safe_int_numeric_string(self):
        assert _safe_int("5") == 5

    def test_safe_int_int(self):
        assert _safe_int(3) == 3

    def test_safe_int_invalid(self):
        assert _safe_int("abc") == 0

    def test_safe_int_custom_default(self):
        assert _safe_int(None, default=99) == 99

    def test_safe_optional_int(self):
        assert _safe_optional_int(None) is None
        assert _safe_optional_int("") is None
        assert _safe_optional_int(0) is None
        assert _safe_optional_int("0") is None
        assert _safe_optional_int(-5) is None
        assert _safe_optional_int(12) == 12
        assert _safe_optional_int("15") == 15
        assert _safe_optional_int("abc") is None

    def test_safe_float_none(self):
        assert _safe_float(None) == 0.0

    def test_safe_float_value(self):
        assert _safe_float(0.15) == 0.15

    def test_safe_float_string(self):
        assert _safe_float("1.5") == 1.5

    def test_safe_bool(self):
        assert _safe_bool(True) is True
        assert _safe_bool(False) is False
        assert _safe_bool("VERDADEIRO") is True
        assert _safe_bool("SIM") is True
        assert _safe_bool("true") is True
        assert _safe_bool("1") is True
        assert _safe_bool("FALSO") is False
        assert _safe_bool("NAO") is False
        assert _safe_bool("0") is False
        assert _safe_bool(None) is None
        assert _safe_bool("") is None
        assert _safe_bool("outro") is None


class TestItemCritico:
    def test_explicit_takes_precedence(self):
        assert _is_item_critico(True, total_bloqueado=0, comp_comb="") is True
        assert _is_item_critico("SIM", total_bloqueado=0, comp_comb="") is True
        assert _is_item_critico("FALSO", total_bloqueado=50, comp_comb="") is False

    def test_quarantine_is_critical(self):
        assert _is_item_critico(None, total_bloqueado=10, comp_comb="") is True

    def test_component_zero_stock_is_critical(self):
        comp = "COMP01 | 1 | TEXTO | 0 | 0"
        assert _is_item_critico(None, total_bloqueado=0, comp_comb=comp) is True

    def test_component_insufficient_stock_is_critical(self):
        # demanda is 600, qtd is 2 -> needs 1200, only has 500
        comp = "COMP01 | 2 | TEXTO | 500 | 0"
        assert _is_item_critico(None, total_bloqueado=0, comp_comb=comp, demanda=600) is True

    def test_sufficient_stock_not_critical(self):
        comp = "COMP01 | 1 | TEXTO | 5000 | 0"
        assert _is_item_critico(None, total_bloqueado=0, comp_comb=comp, demanda=600) is False


class TestParseRows:
    """Test _parse_rows using a real-ish mock workbook."""

    def _make_mock_workbook(self, rows):
        """Build a mock openpyxl workbook with the given rows (list of tuples)."""
        mock_ws = MagicMock()
        mock_ws.iter_rows.return_value = [r for r in rows]
        mock_wb = MagicMock()
        mock_wb.__getitem__ = lambda _, name: mock_ws
        mock_wb.close = MagicMock()
        return mock_wb

    HEADERS = (
        "Material", "op", "posto", "turno", "patan", "linha",
        "pcs/embalagem", "qtdCaixas", "tempPeca", "tempoProd",
        "seqA", "seqB", "seqC", "seqD", "seqE", "seqF", "seqG", "seqH",
        "lotePatan", "diasProd", "kanbanMax", "kanbanMin", "compComb",
        "totalLivre", "totalBloqueado", "leadTime", "isCritico",
    )

    def _make_row(self, **overrides):
        """Build a data row with sensible defaults, overridable per field."""
        defaults = {
            "Material": "TEST001", "op": "0010", "posto": "PT001",
            "turno": 1, "patan": "A", "linha": "LINHA 1",
            "pcs/embalagem": 60, "qtdCaixas": 10, "tempPeca": 0.15,
            "tempoProd": 90, "seqA": "3", "seqB": 0, "seqC": 0,
            "seqD": 0, "seqE": 0, "seqF": 0, "seqG": 0, "seqH": 0,
            "lotePatan": 600, "diasProd": None, "kanbanMax": None,
            "kanbanMin": None, "compComb": "", "totalLivre": 1000,
            "totalBloqueado": 0, "leadTime": 50, "isCritico": None,
        }
        defaults.update(overrides)
        return tuple(defaults[h] for h in self.HEADERS)

    @patch("app.services.excel_import.openpyxl")
    def test_parses_normal_row(self, mock_openpyxl):
        rows = [self.HEADERS, self._make_row()]
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook(rows)

        result = _parse_rows(Path("fake.xlsx"))

        assert len(result) == 1
        item = result[0]
        assert item["material"] == "TEST001"
        assert item["linha"] == "LINHA 1"
        assert item["turno"] == 1
        assert item["patan"] == "A"
        assert item["posto_trabalho"] == "PT001"
        assert item["kanbans"] == 10
        assert item["qtd_por_kanban"] == 60
        assert item["tempo_por_peca_minutos"] == 0.15
        assert item["demanda"] == 600
        assert item["saldo_estoque"] == 1000
        assert item["sequencia"] == 3  # seqA for patan=A
        assert item["is_critico"] is False

    @patch("app.services.excel_import.openpyxl")
    def test_filters_turno_x(self, mock_openpyxl):
        rows = [self.HEADERS, self._make_row(turno="x")]
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook(rows)

        result = _parse_rows(Path("fake.xlsx"))
        assert len(result) == 0

    @patch("app.services.excel_import.openpyxl")
    def test_filters_patan_x(self, mock_openpyxl):
        rows = [self.HEADERS, self._make_row(patan="x")]
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook(rows)

        result = _parse_rows(Path("fake.xlsx"))
        assert len(result) == 0

    @patch("app.services.excel_import.openpyxl")
    def test_is_critico_none_becomes_false(self, mock_openpyxl):
        rows = [self.HEADERS, self._make_row(isCritico=None)]
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook(rows)

        result = _parse_rows(Path("fake.xlsx"))
        assert result[0]["is_critico"] is False

    @patch("app.services.excel_import.openpyxl")
    def test_is_critico_true(self, mock_openpyxl):
        rows = [self.HEADERS, self._make_row(isCritico=True)]
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook(rows)

        result = _parse_rows(Path("fake.xlsx"))
        assert result[0]["is_critico"] is True
        assert result[0]["status"] == 3  # PlanItemStatus.CRITICO

    @patch("app.services.excel_import.openpyxl")
    def test_picks_correct_seq_column_for_patan_b(self, mock_openpyxl):
        rows = [self.HEADERS, self._make_row(patan="B", seqB="7")]
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook(rows)

        result = _parse_rows(Path("fake.xlsx"))
        assert result[0]["sequencia"] == 7
        assert result[0]["patan"] == "B"

    @patch("app.services.excel_import.openpyxl")
    def test_multiple_rows_mixed(self, mock_openpyxl):
        rows = [
            self.HEADERS,
            self._make_row(Material="MAT1", turno=1, patan="A"),
            self._make_row(Material="MAT2", turno="x"),  # skipped
            self._make_row(Material="MAT3", turno=2, patan="C"),
        ]
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook(rows)

        result = _parse_rows(Path("fake.xlsx"))
        assert len(result) == 2
        assert result[0]["material"] == "MAT1"
        assert result[1]["material"] == "MAT3"

    @patch("app.services.excel_import.openpyxl")
    def test_single_sequencia_column(self, mock_openpyxl):
        """Valida que o novo formato com coluna única 'sequencia' é lido diretamente."""
        headers = (
            "Material", "op", "posto", "turno", "patan", "linha",
            "pcs/embalagem", "qtdCaixas", "tempPeca", "tempoProd",
            "sequencia", "lotePatan", "diasProd", "kanbanMax",
            "compComb", "totalLivre", "totalBloqueado", "isCritico",
        )
        row = (
            "MAT_NOVO", "0010", "B642043", 1, "A", "LINHA 1",
            50, 10, 0.2, 100, 5, 500, None, None,
            "", 1000, 0, None,
        )
        mock_openpyxl.load_workbook.return_value = self._make_mock_workbook([headers, row])

        result = _parse_rows(Path("fake.xlsx"))
        assert len(result) == 1
        assert result[0]["material"] == "MAT_NOVO"
        assert result[0]["sequencia"] == 5
        assert result[0]["posto_trabalho"] == "PONTE 43"

