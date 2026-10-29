import { describe, expect, it } from "vitest";
import { extrairCodigosMaterial, isMaterialBloqueado } from "./ferramentariaUtils";

describe("ferramentariaUtils", () => {
  describe("extrairCodigosMaterial", () => {
    it("deve retornar lista vazia para valores nulos ou vazios", () => {
      expect(extrairCodigosMaterial(null)).toEqual([]);
      expect(extrairCodigosMaterial(undefined)).toEqual([]);
      expect(extrairCodigosMaterial("")).toEqual([]);
      expect(extrairCodigosMaterial("   ")).toEqual([]);
    });

    it("deve extrair código único em maiúsculo e sem espaços", () => {
      expect(extrairCodigosMaterial("  h01710sb6a  ")).toEqual(["H01710SB6A"]);
    });

    it("deve decompor materiais compostos por barra", () => {
      const res = extrairCodigosMaterial("L34002EB6A / L34003EB6A");
      expect(res).toContain("L34002EB6A / L34003EB6A");
      expect(res).toContain("L34002EB6A");
      expect(res).toContain("L34003EB6A");
    });

    it("deve decompor materiais compostos por ponto-e-vírgula ou vírgula", () => {
      const res = extrairCodigosMaterial("MAT1; MAT2, MAT3");
      expect(res).toContain("MAT1; MAT2, MAT3");
      expect(res).toContain("MAT1");
      expect(res).toContain("MAT2");
      expect(res).toContain("MAT3");
    });
  });

  describe("isMaterialBloqueado", () => {
    it("deve retornar false quando lista de bloqueados for vazia ou material for nulo", () => {
      expect(isMaterialBloqueado(null, ["MAT1"])).toBe(false);
      expect(isMaterialBloqueado("MAT1", [])).toBe(false);
    });

    it("deve retornar true para correspondência exata", () => {
      expect(isMaterialBloqueado("H01710SB6A", ["H01710SB6A"])).toBe(true);
      expect(isMaterialBloqueado("h01710sb6a", ["H01710SB6A"])).toBe(true);
    });

    it("deve detectar bloqueio quando card tem material composto e ferramentaria bloqueou um submódulo", () => {
      expect(
        isMaterialBloqueado("L34002EB6A / L34003EB6A", ["L34002EB6A"])
      ).toBe(true);
      expect(
        isMaterialBloqueado("L34002EB6A / L34003EB6A", ["L34003EB6A"])
      ).toBe(true);
    });

    it("deve detectar bloqueio quando ferramentaria registrou material composto e card tem material simples", () => {
      expect(
        isMaterialBloqueado("L34002EB6A", ["L34002EB6A / L34003EB6A"])
      ).toBe(true);
      expect(
        isMaterialBloqueado("L34003EB6A", ["L34002EB6A / L34003EB6A"])
      ).toBe(true);
    });

    it("deve retornar false quando material não estiver bloqueado", () => {
      expect(
        isMaterialBloqueado("L34002EB6A / L34003EB6A", ["EST-MAT-999"])
      ).toBe(false);
    });
  });
});
