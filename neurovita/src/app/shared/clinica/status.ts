import { StatusConsulta } from './modelos';

/** Texto do botão de status da consulta (ex.: "Confirmada"). */
export const ROTULO_STATUS: Record<StatusConsulta, string> = {
  confirmado: 'Confirmada',
  pendente: 'Pendente',
  remarcado: 'Remarcada',
  cancelado: 'Cancelada',
};

/** Texto da etiqueta nas listas (ex.: "Confirmado"). */
export const ROTULO_CHIP: Record<StatusConsulta, string> = {
  confirmado: 'Confirmado',
  pendente: 'Pendente',
  remarcado: 'Remarcado',
  cancelado: 'Cancelada',
};

export const ORDEM_STATUS: StatusConsulta[] = ['confirmado', 'pendente', 'remarcado', 'cancelado'];

/** Linhas da grade da agenda e horários de consulta: só 08, 09, 10, 11, 12, 13, 14, 15, 16 e 17 horas. */
export const HORAS_AGENDA: string[] = Array.from({ length: 10 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);

/** Horários da agenda (os mesmos da grade, de 1 em 1 hora). */
export const HORARIOS_AGENDA: string[] = HORAS_AGENDA;

/** Horários oferecidos ao marcar ou remarcar uma consulta. */
export const HORARIOS_CONSULTA: string[] = HORAS_AGENDA;

export const SALAS = ['Sala 01', 'Sala 02', 'Sala 03', 'Sala 04'];

export const minutosDe = (hora: string): number => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
