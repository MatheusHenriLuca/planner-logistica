export interface ChecklistItemOut {
  id: number;
  item_producao_id: number;
  texto: string;
  concluido: boolean;
  ordem: number;
}

export interface LabelOut {
  id: number;
  nome: string;
  cor: string;
}

export interface ComentarioOut {
  id: number;
  texto: string;
  autor_id: number;
  autor_username: string;
  criado_em: string;
}

export interface AnexoOut {
  id: number;
  titulo: string;
  url: string;
  enviado_por: number;
  enviado_por_username: string;
  criado_em: string;
}

export interface CriarChecklistItemRequest {
  texto: string;
  ordem: number;
}

export interface AtualizarChecklistItemRequest {
  texto?: string;
  concluido?: boolean;
}

export interface SubstituirLabelsRequest {
  label_ids: number[];
}

export interface CriarComentarioRequest {
  texto: string;
}

export interface CriarAnexoRequest {
  titulo: string;
  url: string;
}
