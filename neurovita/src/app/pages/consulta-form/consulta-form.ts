import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Aviso } from '../../shared/aviso/aviso';
import { Clinica } from '../../shared/clinica/clinica';
import { TipoAtendimento } from '../../shared/clinica/modelos';
import { rotuloProfissional as rotuloDe } from '../../shared/clinica/rotulos';
import { HORARIOS_CONSULTA, SALAS } from '../../shared/clinica/status';
import { Avatar } from '../../shared/avatar/avatar';
import { SEGUNDA_BASE } from '../../shared/dados-agenda';
import { hojeAtual } from '../../shared/relogio';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Icone } from '../../shared/icone/icone';
import { ListaSuspensa, OpcaoLista } from '../../shared/lista-suspensa/lista-suspensa';
import { Perfil } from '../../shared/perfil';
import { TituloPagina } from '../../shared/titulo-pagina/titulo-pagina';
import { MESES_CURTOS, deISO, diaDaSemana, formatarData, idadeDe, somarDias } from '../../shared/util';

const NOMES_DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Cada consulta agendada dura 1 hora (os horários são de 1 em 1 hora). */
const DURACAO = 60;

/** Gerenciamento de consultas: escolher paciente e profissional, ver horários livres e agendar. */
@Component({
  selector: 'app-consulta-form',
  imports: [Avatar, Dialogo, Icone, ListaSuspensa, TituloPagina],
  templateUrl: './consulta-form.html',
})
export class ConsultaForm {
  private readonly clinica = inject(Clinica);
  private readonly aviso = inject(Aviso);
  private readonly router = inject(Router);

  readonly perfil = input<Perfil>('secretaria');

  protected readonly pacienteId = signal('');
  protected readonly profissionalId = signal('');
  protected readonly atendimento = signal<TipoAtendimento>('Presencial');
  protected readonly local = signal('Unidade Santa Maria');
  protected readonly semana = signal(0);
  protected readonly dia = signal(hojeAtual());
  protected readonly hora = signal('');
  protected readonly tentou = signal(false);
  protected readonly confirmando = signal(false);

  protected readonly opcoesAtendimento: OpcaoLista[] = [
    { valor: 'Presencial', rotulo: 'Presencial' },
    { valor: 'Online', rotulo: 'Online' },
  ];

  protected readonly opcoesPacientes = computed<OpcaoLista[]>(() =>
    this.clinica.pacientes()
      .filter((p) => p.status !== 'inativo')
      .map((p) => ({ valor: p.id, rotulo: `${p.nome} - ${idadeDe(p.nascimento)} anos` })),
  );

  protected readonly opcoesProfissionais = computed<OpcaoLista[]>(() =>
    this.clinica.profissionais()
      .filter((p) => p.ativo)
      .map((p) => ({ valor: p.id, rotulo: rotuloDe(p) })),
  );

  protected readonly paciente = computed(() => this.clinica.paciente(this.pacienteId()));
  protected readonly profissional = computed(() => this.clinica.profissional(this.profissionalId()));
  protected readonly idade = computed(() => (this.paciente() ? idadeDe(this.paciente()!.nascimento) : 0));
  protected readonly rotuloProfissional = computed(() => {
    const p = this.profissional();
    return p ? rotuloDe(p) : '';
  });

  /** Os 6 dias (seg a sáb) da semana mostrada. */
  protected readonly dias = computed(() =>
    NOMES_DIAS.map((nome, i) => {
      const iso = somarDias(SEGUNDA_BASE, this.semana() * 7 + i);
      const d = deISO(iso);
      return { nome, iso, numero: String(d.getDate()).padStart(2, '0'), mes: MESES_CURTOS[d.getMonth()], passado: iso < hojeAtual() };
    }),
  );

  private livre(hora: string): boolean {
    const dia = this.dia();
    if (!this.profissionalId() || dia < hojeAtual()) return false;
    // O profissional precisa atender nesse dia, horário e tipo de atendimento (online/presencial).
    if (!this.clinica.disponivel(this.profissionalId(), dia, hora, DURACAO, this.atendimento())) return false;
    // Os horários abertos se alternam de um dia para o outro, sem depender da hora de agora.
    if (!this.clinica.horarioAberto(this.profissionalId(), dia, hora)) return false;
    return this.clinica.horarioLivre(dia, hora, DURACAO, this.profissionalId(), this.pacienteId() || undefined);
  }

  /** Explica por que não há horários (dia de folga, não atende online etc.). */
  protected readonly dicaHorarios = computed(() => {
    const p = this.profissional();
    if (!p) return 'Selecione um profissional para ver os horários livres.';
    const d = p.disponibilidade;
    const nome = p.tratamento ? `${p.tratamento} ${p.nome}` : p.nome;
    if (this.atendimento() === 'Online' ? !d.online : !d.presencial) {
      return `${nome} não atende ${this.atendimento() === 'Online' ? 'online' : 'presencialmente'}.`;
    }
    if (!d.dias.includes(diaDaSemana(this.dia()))) return `${nome} não atende neste dia da semana.`;
    if (!this.horarios().some((h) => h.livre)) return 'Não há horários livres neste dia.';
    return '';
  });

  protected readonly horarios = computed(() => HORARIOS_CONSULTA.map((hora) => ({ hora, livre: this.livre(hora) })));

  /** O horário escolhido só vale enquanto continuar livre (ao trocar de dia ou profissional ele some). */
  protected readonly horaValida = computed(() => {
    const h = this.hora();
    return h && this.horarios().some((x) => x.hora === h && x.livre) ? h : '';
  });

  protected escolherDia(iso: string, passado: boolean): void {
    if (!passado) this.dia.set(iso);
  }

  protected mudarSemana(delta: number): void {
    const proxima = this.semana() + delta;
    this.semana.set(proxima);
    // Seleciona o primeiro dia disponível da nova semana (ou hoje, se for a semana atual).
    const dias = somarDias(SEGUNDA_BASE, proxima * 7);
    const primeiro = proxima === 0 ? hojeAtual() : dias;
    if (primeiro >= hojeAtual()) this.dia.set(primeiro);
  }

  protected readonly formatar = formatarData;

  protected readonly semDiaSemana = diaDaSemana;

  protected erroPaciente = () => this.tentou() && !this.pacienteId();
  protected erroProfissional = () => this.tentou() && !this.profissionalId();

  protected salvar(): void {
    this.tentou.set(true);
    if (!this.pacienteId()) return this.aviso.mostrar('Selecione o paciente.');
    if (!this.profissionalId()) return this.aviso.mostrar('Selecione o profissional.');
    if (!this.horaValida()) return this.aviso.mostrar('Escolha um horário disponível.');
    this.confirmando.set(true);
  }

  protected confirmar(): void {
    const paciente = this.paciente();
    if (!paciente || !this.horaValida()) return;
    const data = this.dia();
    const inicio = this.horaValida();
    const presencial = this.atendimento() === 'Presencial';
    const novo = this.clinica.adicionarAgendamento({
      data, inicio, duracao: DURACAO, pacienteId: paciente.id, profissionalId: this.profissionalId(),
      tipo: paciente.consultas.length ? 'Acompanhamento' : 'Avaliação inicial', atendimento: this.atendimento(),
      sala: presencial ? this.clinica.salaLivre(data, inicio, DURACAO, SALAS) : 'Online',
      local: this.local().trim() || 'Unidade Santa Maria', status: 'pendente',
    });
    this.confirmando.set(false);
    this.aviso.mostrar('Consulta agendada com sucesso. Ela fica como pendente até a confirmação.');
    this.router.navigate(['/', this.perfil(), 'agenda'], { queryParams: { consulta: novo.id } });
  }

  protected cancelar(): void {
    this.router.navigate(['/', this.perfil()]);
  }
}
