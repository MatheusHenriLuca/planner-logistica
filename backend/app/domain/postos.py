import re

def normalizar_posto_trabalho(posto: str, setor: str = "solda") -> str:
    """Normaliza o nome do posto de trabalho.
    
    Para o setor de solda (ou códigos SAP legados iniciando com B6420/B642):
    Converte 'B642043' -> 'PONTE 43', 'B642036' -> 'PONTE 36', etc.
    Também padroniza variações como 'PONT 43', 'Ponteadeira 43' para 'PONTE 43'.
    Para estamparia, preserva nomenclaturas de prensas (ex: 'PR-108', 'PR-82').
    """
    if not posto:
        return ""
    p = str(posto).strip()
    m = re.match(r"^B6420?(\d+)$", p, re.IGNORECASE)
    if m:
        return f"PONTE {int(m.group(1))}"
    m2 = re.match(r"^PONT(?:EADEIRA)?\s*[-_]?\s*(\d+)$", p, re.IGNORECASE)
    if m2:
        return f"PONTE {int(m2.group(1))}"
    return p

