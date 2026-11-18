import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';

import { Aviso } from '../../shared/aviso/aviso';
import { Clinica } from '../../shared/clinica/clinica';
import { Agendamento, StatusConsulta, TipoAtendimento } from '../../shared/clinica/modelos';
import { nomeProfissional } from '../../shared/clinica/rotulos';
import { HORARIOS_AGENDA, HORAS_AGENDA, ORDEM_STATUS, ROTULO_STATUS, SALAS, minutosDe } from '../../shared/clinica/status';
import { Avatar } from '../../shared/avatar/avatar';
import { SEGUNDA_BASE } from '../../shared/dados-agenda';
import { horaAtual, hojeAtual } from '../../shared/relogio';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Icone } from '../../shared/icone/icone';
import { ListaSuspensa } from '../../shared/lista-suspensa/lista-suspensa';
import { Perfil } from '../../shared/perfil';
import { TituloPagina } from '../../shared/titulo-pagina/titulo-pagina';
import { deISO, diaDaSemana, formatarData, idadeDe, normalizar, paraISO, somarDias } from '../../shared/util';

const NOMES_DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_EXTENSO = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const dm = (iso: string) => formatarData(iso).slice(0, 5);
const deMinutos = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Quantas semanas depois (ou antes) da semana inicial está uma data. */
function semanaDe(iso: string): number {
  const dias = Math.round((deISO(iso).getTime() - deISO(SEGUNDA_BASE).getTime()) / DIA_MS);
  return Math.floor(dias / 7);
}

/**
 * Agenda semanal: grade de horários, resumo do dia, próximo atendimento e paciente selecionado.
 * - Psicólogo: troca o status por um menu.
 * - Secretária: abre a janela "Editar consulta" (confirmar, remarcar ou cancelar).
 */
@Component({
  selector: 'app-agenda',
  imports: [Avatar, Dialogo, Icone, ListaSuspensa, TituloPagina],
  templateUrl: './agenda.html',
  host: { '(document:click)': 'fecharMenu($event)', '(document:keydown.escape)': 'aoApertarEsc()' },
})
export class Agenda {
  private readonly clinica = inject(Clinica);
  private readonly aviso = inject(Aviso);

  /** Vem do `data` da rota. */
  readonly perfil = input<Perfil>('secretaria');
  /** Vem do endereço (?consulta=ID): seleciona essa consulta ao abrir. */
  readonly consulta = input<string>();

  protected readonly horas = HORAS_AGENDA;
  protected readonly colunas = [0, 1, 2, 3, 4, 5];
  protected readonly statusLista = ORDEM_STATUS;
  protected readonly rotulo = ROTULO_STATUS;
  protected readonly salas = SALAS;

  protected readonly semana = signal(0);
  protected readonly busca = signal('');
  protected readonly selecionadoId = signal('ag-1');
  protected readonly menuStatus = signal(false);

  // Janela "Editar consulta"
  protected readonly editando = signal(false);
  protected readonly cancelando = signal(false);
  protected readonly editData = signal('');
  protected readonly editHora = signal('');
  protected readonly editProf = signal('');
  protected readonly editSala = signal('');
  protected readonly editAtend = signal<TipoAtendimento>('Presencial');
  /** Qual lista está aberta dentro da janela: o calendário da data ou a lista de horários. */
  protected readonly popup = signal<'data' | 'hora' | null>(null);
  /** Mês mostrado no calendário da janela. */
  protected readonly mesCal = signal({ ano: 2026, mes: 0 });

  private readonly seletorData = viewChild<ElementRef<HTMLInputElement>>('seletorData');
  private readonly menuRaiz = viewChild<ElementRef<HTMLElement>>('menuStatusRaiz');

  /** Secretária e administrador usam a janela "Editar consulta". */
  protected readonly secretaria = computed(() => this.perfil() === 'secretaria' || this.perfil() === 'admin');
  /** Hoje, no relógio real (atualiza sozinho). */
  protected get hojeISO(): string {
    return hojeAtual();
  }
  protected get dataHoje(): string {
    return formatarData(hojeAtual());
  }

  constructor() {
    effect(() => {
      const alvo = this.clinica.agendamento(this.consulta());
      if (!alvo) return;
      this.selecionadoId.set(alvo.id);
      this.semana.set(semanaDe(alvo.data));
    });
  }

  /** Os 6 dias (seg a sáb) da semana mostrada. */
  protected readonly dias = computed(() =>
    NOMES_DIAS.map((nome, i) => {
      const iso = somarDias(SEGUNDA_BASE, this.semana() * 7 + i);
      return { nome, iso, texto: dm(iso), hoje: iso === hojeAtual(), dataCompleta: formatarData(iso) };
    }),
  );

  protected readonly faixa = computed(() => `${this.dias()[0].dataCompleta} - ${this.dias()[5].dataCompleta}`);

  /** Consultas da semana mostrada, já com a posição na grade. */
  protected readonly eventos = computed(() => {
    const termo = normalizar(this.busca());
    const dias = this.dias();
    const primeiro = dias[0].iso;
    const ultimo = dias[5].iso;
    return this.clinica
      .agendamentos()
      .filter((a) => a.data >= primeiro && a.data <= ultimo)
      .map((a) => {
        const paciente = this.clinica.paciente(a.pacienteId);
        const prof = this.clinica.profissional(a.profissionalId);
        return {
          ...a,
          nome: paciente?.nome ?? '—',
          profNome: prof ? nomeProfissional(prof) : '—',
          dia: diaDaSemana(a.data),
          fim: deMinutos(minutosDe(a.inicio) + a.duracao),
          // Cada consulta fica no quadrado da hora em que começa.
          linhaDaHora: Math.floor((minutosDe(a.inicio) - 8 * 60) / 60),
          destaque: !termo || normalizar(paciente?.nome ?? '').includes(termo),
          selecionado: a.id === this.selecionadoId(),
        };
      });
  });

  /** A grade: para cada hora (linha) e cada dia (coluna), as consultas que começam ali. */
  protected readonly grade = computed(() => {
    const lista = this.eventos();
    return this.horas.map((_, linha) =>
      this.colunas.map((coluna) =>
        lista
          .filter((e) => e.dia === coluna && e.linhaDaHora === linha)
          .sort((x, y) => minutosDe(x.inicio) - minutosDe(y.inicio)),
      ),
    );
  });

  private readonly hoje = computed(() => this.clinica.agendamentos().filter((a) => a.data === hojeAtual()));

  protected readonly resumo = computed(() => {
    const lista = this.hoje();
    const conta = (st: StatusConsulta) => lista.filter((a) => a.status === st).length;
    return [
      { classe: 'confirmado', rotulo: 'Confirmados', valor: conta('confirmado') },
      { classe: 'pendente', rotulo: 'A confirmar', valor: conta('pendente') },
      { classe: 'cancelado', rotulo: 'Cancelados', valor: conta('cancelado') },
      { classe: 'remarcado', rotulo: 'Remarcado', valor: conta('remarcado') },
    ];
  });

  protected readonly proximo = computed(() =>
    this.hoje()
      .filter((a) => a.status !== 'cancelado' && minutosDe(a.inicio) > minutosDe(horaAtual()))
      .sort((x, y) => minutosDe(x.inicio) - minutosDe(y.inicio))[0],
  );

  protected readonly escolhido = computed(() => {
    const a = this.clinica.agendamento(this.selecionadoId());
    if (!a) return undefined;
    const paciente = this.clinica.paciente(a.pacienteId);
    const prof = this.clinica.profissional(a.profissionalId);
    const relativo = a.data === hojeAtual() ? 'Hoje' : a.data === somarDias(hojeAtual(), 1) ? 'Amanhã' : DIAS_EXTENSO[diaDaSemana(a.data)];
    return {
      a, relativo, dataBR: formatarData(a.data),
      nome: paciente?.nome ?? '—',
      idade: paciente ? idadeDe(paciente.nascimento) : 0,
      diagnostico: (paciente?.diagnostico.principal ?? '').split('(')[0].trim(),
      telefone: paciente?.responsavel.telefone ?? paciente?.telefone ?? '—',
      email: paciente?.responsavel.email || paciente?.email || '—',
      profissional: prof ? nomeProfissional(prof) : '—',
    };
  });

  /* ---------- Navegação ---------- */

  protected selecionar(id: string): void {
    this.selecionadoId.set(id);
    this.menuStatus.set(false);
  }

  protected irPara(delta: number): void {
    this.semana.update((s) => s + delta);
  }

  protected irParaHoje(): void {
    this.semana.set(0);
  }

  protected abrirCalendario(): void {
    const campo = this.seletorData()?.nativeElement;
    if (!campo) return;
    try {
      campo.showPicker();
    } catch {
      campo.focus();
    }
  }

  protected escolherData(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    if (valor) this.semana.set(semanaDe(paraISO(deISO(valor))));
  }

  protected fecharMenu(evento: Event): void {
    if (this.popup() && !(evento.target as HTMLElement).closest?.('.ed-pop-raiz')) this.popup.set(null);
    if (this.menuStatus() && !this.menuRaiz()?.nativeElement.contains(evento.target as Node)) this.menuStatus.set(false);
  }

  /* ---------- Psicólogo: trocar o status ---------- */

  protected trocarStatus(status: StatusConsulta): void {
    const a = this.escolhido()?.a;
    if (a) this.clinica.atualizarAgendamento({ ...a, status });
    this.menuStatus.set(false);
  }

  /* ---------- Secretária: janela "Editar consulta" ---------- */

  protected abrirEdicao(): void {
    const e = this.escolhido();
    if (!e) return;
    this.editData.set(e.a.data);
    this.editHora.set(e.a.inicio);
    this.editProf.set(e.a.profissionalId);
    this.editSala.set(e.a.sala);
    this.editAtend.set(e.a.atendimento);
    this.popup.set(null);
    this.mesCal.set(this.mesDe(e.a.data));
    this.editando.set(true);
  }

  private mesDe(iso: string): { ano: number; mes: number } {
    const d = deISO(iso);
    return { ano: d.getFullYear(), mes: d.getMonth() };
  }

  /* ----- Calendário da data ----- */

  protected readonly nomeMesCal = computed(() => {
    const { ano, mes } = this.mesCal();
    const nome = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  });

  protected readonly dataEditada = computed(() => formatarData(this.editData()));

  protected readonly diasSemanaCal = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  /** Dias do mês mostrado (domingo a sábado). Dias em que o profissional não atende ficam desabilitados. */
  protected readonly semanasCal = computed(() => {
    const { ano, mes } = this.mesCal();
    const atende = this.clinica.profissional(this.editProf())?.disponibilidade.dias ?? [];
    const original = this.escolhido()?.a.data;
    const dias: { iso: string; numero: number; selecionado: boolean; desabilitado: boolean }[] = [];
    const vazios = new Date(ano, mes, 1).getDay();
    for (let i = 0; i < vazios; i++) dias.push({ iso: '', numero: 0, selecionado: false, desabilitado: true });
    const total = new Date(ano, mes + 1, 0).getDate();
    for (let n = 1; n <= total; n++) {
      const iso = paraISO(new Date(ano, mes, n));
      dias.push({
        iso, numero: n, selecionado: iso === this.editData(),
        desabilitado: iso !== original && !atende.includes(diaDaSemana(iso)),
      });
    }
    return dias;
  });

  protected alternarPopup(qual: 'data' | 'hora'): void {
    this.popup.set(this.popup() === qual ? null : qual);
    if (qual === 'data' && this.popup() === 'data') this.mesCal.set(this.mesDe(this.editData()));
  }

  protected mudarMesCal(delta: number): void {
    const { ano, mes } = this.mesCal();
    const d = new Date(ano, mes + delta, 1);
    this.mesCal.set({ ano: d.getFullYear(), mes: d.getMonth() });
  }

  protected escolherDia(iso: string): void {
    this.editData.set(iso);
    this.popup.set(null);
    this.ajustarHorarioESala();
  }

  protected escolherHora(hora: string): void {
    this.editHora.set(hora);
    this.popup.set(null);
    this.ajustarHorarioESala();
  }

  protected mudarProfissional(id: string): void {
    this.editProf.set(id);
    this.ajustarHorarioESala();
  }

  protected mudarAtendimento(tipo: TipoAtendimento): void {
    this.editAtend.set(tipo);
    this.ajustarHorarioESala();
  }

  /** Se o horário escolhido deixou de estar livre, pega o primeiro livre. A sala segue o horário. */
  private ajustarHorarioESala(): void {
    const e = this.escolhido();
    if (!e) return;
    const opcoes = this.opcoesHorario();
    if (!opcoes.includes(this.editHora())) this.editHora.set(opcoes[0] ?? '');
    const igual = this.editData() === e.a.data && this.editHora() === e.a.inicio;
    this.editSala.set(
      igual ? e.a.sala : this.editHora() ? this.clinica.salaLivre(this.editData(), this.editHora(), e.a.duracao, this.salas) : e.a.sala,
    );
  }

  protected aoApertarEsc(): void {
    if (this.popup()) this.popup.set(null);
    else this.editando.set(false);
  }

  protected readonly opcoesProfissionais = computed(() =>
    this.clinica.profissionais().filter((p) => p.ativo || p.id === this.escolhido()?.a.profissionalId)
      .map((p) => ({ valor: p.id, rotulo: nomeProfissional(p) })),
  );

  /** Horários em que o profissional está livre na data escolhida (mais o horário atual da consulta). */
  protected readonly opcoesHorario = computed(() => {
    const e = this.escolhido();
    if (!e) return [];
    const mesmoDiaEProf = this.editData() === e.a.data && this.editProf() === e.a.profissionalId;
    return HORARIOS_AGENDA.filter(
      (h) =>
        (mesmoDiaEProf && h === e.a.inicio) ||
        (this.clinica.disponivel(this.editProf(), this.editData(), h, e.a.duracao, this.editAtend()) &&
          this.clinica.horarioAberto(this.editProf(), this.editData(), h) &&
          this.clinica.horarioLivre(this.editData(), h, e.a.duracao, this.editProf(), e.a.pacienteId, e.a.id)),
    );
  });

  private podeSalvar(): boolean {
    const e = this.escolhido();
    if (!e) return false;
    if (!this.editData() || !this.editHora() || !this.editProf()) {
      this.aviso.mostrar('Preencha data, horário e profissional.');
      return false;
    }
    if (!this.clinica.horarioLivre(this.editData(), this.editHora(), e.a.duracao, this.editProf(), e.a.pacienteId, e.a.id)) {
      this.aviso.mostrar('Esse horário já está ocupado para o profissional ou para o paciente.');
      return false;
    }
    return true;
  }

  private aplicar(status: StatusConsulta, mensagem: string): void {
    const e = this.escolhido();
    if (!e) return;
    const atualizado: Agendamento = {
      ...e.a, data: this.editData(), inicio: this.editHora(), profissionalId: this.editProf(), sala: this.editSala(), atendimento: this.editAtend(), status,
    };
    this.clinica.atualizarAgendamento(atualizado);
    this.semana.set(semanaDe(atualizado.data));
    this.editando.set(false);
    this.aviso.mostrar(mensagem);
  }

  protected confirmarConsulta(): void {
    if (this.podeSalvar()) this.aplicar('confirmado', 'Consulta confirmada.');
  }

  protected remarcarConsulta(): void {
    const e = this.escolhido();
    if (!e || !this.podeSalvar()) return;
    const mudou = this.editData() !== e.a.data || this.editHora() !== e.a.inicio || this.editProf() !== e.a.profissionalId || this.editAtend() !== e.a.atendimento;
    if (!mudou) {
      this.aviso.mostrar('Altere a data, o horário, o profissional ou o tipo de atendimento para remarcar.');
      return;
    }
    this.aplicar('remarcado', 'Consulta remarcada.');
  }

  protected confirmarCancelamento(): void {
    const e = this.escolhido();
    if (!e) return;
    this.clinica.atualizarAgendamento({ ...e.a, status: 'cancelado' });
    this.cancelando.set(false);
    this.editando.set(false);
    this.aviso.mostrar('Consulta cancelada.');
  }
}
