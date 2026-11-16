import { Injectable, signal } from '@angular/core';

import { Perfil } from './perfil';
import { FormatoData, formatoDataAtual } from './util';

export type Tema = 'claro' | 'escuro';

export interface Preferencias {
  idioma: 'pt' | 'en';
  formatoData: FormatoData;
  /** Duração padrão da consulta, em minutos. */
  duracao: string;
  /** 0 = domingo ... 6 = sábado */
  inicioSemana: number;
  lembreteEmail: boolean;
  lembreteAlertas: boolean;
  avisoSistema: boolean;
  doisFatores: boolean;
  tema: Tema;
}

export interface DadosPerfil {
  nome: string;
  cargo: string;
  email: string;
}

export const PREFERENCIAS_PADRAO: Preferencias = {
  idioma: 'pt', formatoData: 'DD/MM/AAAA', duracao: '50', inicioSemana: 1,
  lembreteEmail: false, lembreteAlertas: false, avisoSistema: false, doisFatores: false, tema: 'claro',
};

const PERFIS_PADRAO: Record<Perfil, DadosPerfil> = {
  secretaria: { nome: 'Dra. Juliana da Costa', cargo: 'Secretária Responsável', email: 'juliana.costa@neurovita.com.br' },
  admin: { nome: 'Administrador do Sistema', cargo: 'Administrador', email: 'admin@neurovita.com' },
};

const CHAVE_PREFERENCIAS = 'neurovita.preferencias';
const CHAVE_PERFIS = 'neurovita.perfis';

function ler<T>(chave: string, padrao: T): T {
  try {
    const texto = localStorage.getItem(chave);
    return texto ? { ...padrao, ...JSON.parse(texto) } : { ...padrao };
  } catch {
    return { ...padrao };
  }
}

function guardar(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: as preferências valem só até recarregar a página */
  }
}

/**
 * Preferências do sistema (tela Configurações). Ficam guardadas no navegador.
 * TODO (back-end): salvar por usuário na API.
 */
@Injectable({ providedIn: 'root' })
export class Configuracoes {
  readonly salvas = signal<Preferencias>(ler(CHAVE_PREFERENCIAS, PREFERENCIAS_PADRAO));
  readonly perfis = signal<Record<Perfil, DadosPerfil>>({
    secretaria: ler(CHAVE_PERFIS + '.secretaria', PERFIS_PADRAO.secretaria),
    admin: ler(CHAVE_PERFIS + '.admin', PERFIS_PADRAO.admin),
  });

  constructor() {
    this.aplicar(this.salvas());
  }

  salvar(p: Preferencias): void {
    this.salvas.set({ ...p });
    guardar(CHAVE_PREFERENCIAS, p);
    this.aplicar(p);
  }

  restaurarPadrao(): Preferencias {
    return { ...PREFERENCIAS_PADRAO };
  }

  salvarPerfil(perfil: Perfil, dados: DadosPerfil): void {
    this.perfis.update((atual) => ({ ...atual, [perfil]: dados }));
    guardar(CHAVE_PERFIS + '.' + perfil, dados);
  }

  /** Coloca em prática o que dá para aplicar na hora: tema, idioma da página e formato das datas. */
  private aplicar(p: Preferencias): void {
    formatoDataAtual.set(p.formatoData);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset['tema'] = p.tema;
      document.documentElement.lang = p.idioma === 'en' ? 'en' : 'pt-BR';
    }
  }
}
