import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Documentacao } from "./Documentacao";

describe("Documentacao Page", () => {
  it("renderiza o cabeçalho executivo e o contexto padrão de Visão Geral", () => {
    render(<Documentacao />);

    expect(
      screen.getByRole("heading", { name: /Central de Documentação & Suporte Técnico/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/1\. Filosofia Lean TPS e Segregação Setorial/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Tabela A \(producao_staging\)/i)).toBeInTheDocument();
  });

  it("permite navegar para o contexto de Programação de Patan", () => {
    render(<Documentacao />);

    const btnProg = screen.getByRole("button", { name: /01\. Programação de Patan/i });
    fireEvent.click(btnProg);

    expect(
      screen.getByText(/1\. Operação do Cockpit de Programação/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2\. Regras de Ouro da Cascata de Horários/i)
    ).toBeInTheDocument();
  });

  it("permite navegar para o contexto de APIs Swagger e filtrar endpoints", () => {
    render(<Documentacao />);

    const btnApi = screen.getByRole("button", { name: /08\. Referência de APIs/i });
    fireEvent.click(btnApi);

    expect(screen.getByText("/producao/tabela-b")).toBeInTheDocument();
    expect(screen.getByText("/producao/sequencia/enviar")).toBeInTheDocument();

    // Filtra por método PATCH
    const btnPatch = screen.getByRole("button", { name: /^PATCH$/i });
    fireEvent.click(btnPatch);

    expect(screen.getByText("/producao/itens/{id}/concluir-producao")).toBeInTheDocument();
    expect(screen.queryByText("/producao/tabela-b")).not.toBeInTheDocument();

    // Filtra por texto de busca
    const inputBusca = screen.getByPlaceholderText(/Filtrar endpoints por caminho/i);
    fireEvent.change(inputBusca, { target: { value: "quebra" } });

    expect(screen.getByText("/producao/itens/{id}/quebra-ferramenta")).toBeInTheDocument();
    expect(screen.queryByText("/producao/itens/{id}/concluir-producao")).not.toBeInTheDocument();
  });
});
