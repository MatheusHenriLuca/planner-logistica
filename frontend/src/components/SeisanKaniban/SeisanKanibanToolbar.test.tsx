import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SeisanKanibanToolbar,
  type AlturaFaixa,
  type FiltroStatusRealizado,
} from "./SeisanKanibanToolbar";
import type { GranularidadeZoom } from "../../utils/seisanTimeUtils";

describe("SeisanKanibanToolbar", () => {
  it("renderiza os controles de faixas, filtro do realizado e zoom temporal", () => {
    const onZoomChange = vi.fn();
    const onToggleTeorico = vi.fn();
    const onToggleProgramado = vi.fn();
    const onToggleRealizado = vi.fn();
    const onFiltroChange = vi.fn();
    const onAlturaChange = vi.fn();

    render(
      <SeisanKanibanToolbar
        granularidadeZoom="hora_1h"
        onGranularidadeZoomChange={onZoomChange}
        exibirFaixaTeorico={true}
        onToggleFaixaTeorico={onToggleTeorico}
        exibirFaixaProgramado={true}
        onToggleFaixaProgramado={onToggleProgramado}
        exibirFaixaRealizado={true}
        onToggleFaixaRealizado={onToggleRealizado}
        onMostrarTodasFaixas={vi.fn()}
        filtroRealizado="todos"
        onFiltroRealizadoChange={onFiltroChange}
        alturaFaixa="normal"
        onAlturaFaixaChange={onAlturaChange}
        contadores={{ total: 10, concluidos: 4, quebras: 2, produzindo: 1, pendentes: 3 }}
      />
    );

    // Faixas
    expect(screen.getByText("1. Teórico")).toBeInTheDocument();
    expect(screen.getByText("2. Programado")).toBeInTheDocument();
    expect(screen.getByText("3. Realizado")).toBeInTheDocument();

    // Filtros de Status
    expect(screen.getByText(/Todos \(10\)/)).toBeInTheDocument();
    expect(screen.getByText(/Concluídos \(4\)/)).toBeInTheDocument();
    expect(screen.getByText(/Quebras \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ao Vivo \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Fila \(3\)/)).toBeInTheDocument();

    // Densidade de Altura
    expect(screen.getByText("Compacta")).toBeInTheDocument();
    expect(screen.getByText("Padrão")).toBeInTheDocument();
    expect(screen.getByText("Espaçosa")).toBeInTheDocument();

    // Interações
    fireEvent.click(screen.getByText("1. Teórico"));
    expect(onToggleTeorico).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/Concluídos/));
    expect(onFiltroChange).toHaveBeenCalledWith("concluidos");

    fireEvent.click(screen.getByText("Espaçosa"));
    expect(onAlturaChange).toHaveBeenCalledWith("espacosa");
  });

  it("permite zoom in e zoom out através dos botões", () => {
    const onZoomChange = vi.fn();

    render(
      <SeisanKanibanToolbar
        granularidadeZoom="hora_1h"
        onGranularidadeZoomChange={onZoomChange}
        exibirFaixaTeorico={true}
        onToggleFaixaTeorico={vi.fn()}
        exibirFaixaProgramado={true}
        onToggleFaixaProgramado={vi.fn()}
        exibirFaixaRealizado={true}
        onToggleFaixaRealizado={vi.fn()}
        onMostrarTodasFaixas={vi.fn()}
        filtroRealizado="todos"
        onFiltroRealizadoChange={vi.fn()}
        alturaFaixa="normal"
        onAlturaFaixaChange={vi.fn()}
      />
    );

    // Zoom in deve avançar de hora_1h para min_30m
    const zoomInBtn = screen.getByTitle("Aproximar escala para minutos (Zoom In)");
    fireEvent.click(zoomInBtn);
    expect(onZoomChange).toHaveBeenCalledWith("min_30m");

    // Zoom out deve recuar de hora_1h para macro_2h
    const zoomOutBtn = screen.getByTitle("Afastar escala de tempo (Zoom Out)");
    fireEvent.click(zoomOutBtn);
    expect(onZoomChange).toHaveBeenCalledWith("macro_2h");
  });
});
