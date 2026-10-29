import React from "react";

interface GestampLogoProps {
  variant?: "full" | "symbol";
  className?: string;
  subtitulo?: string;
  tamanho?: "sm" | "md" | "lg";
}

export function GestampLogo({
  variant = "full",
  className = "",
  subtitulo = "Planner Logística",
  tamanho = "md",
}: GestampLogoProps) {
  if (variant === "symbol") {
    const dimensoesSimbolo =
      tamanho === "sm" ? "w-6 h-6" : tamanho === "lg" ? "w-10 h-10" : "w-8 h-8";

    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 rounded-lg p-1 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs ${dimensoesSimbolo} ${className}`}
        title="Gestamp"
      >
        <img
          src="/gestamp-simbolo.png"
          alt="Gestamp"
          className="w-full h-full object-contain dark:brightness-0 dark:invert"
        />
      </div>
    );
  }

  const alturaLogo =
    tamanho === "sm" ? "h-5" : tamanho === "lg" ? "h-8" : "h-6";

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div className="flex flex-col">
        <img
          src="/gestamp-logo.png"
          alt="Gestamp"
          className={`${alturaLogo} w-auto object-contain transition-all dark:brightness-0 dark:invert`}
        />
        {subtitulo && (
          <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400 mt-0.5">
            {subtitulo}
          </span>
        )}
      </div>
    </div>
  );
}
