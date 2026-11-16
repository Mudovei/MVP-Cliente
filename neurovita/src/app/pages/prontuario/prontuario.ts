import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Clinica } from '../../shared/clinica/clinica';
import { rotuloProfissional } from '../../shared/clinica/rotulos';
import { SECOES, secoesDoPerfil } from '../../shared/clinica/secoes';
import { hojeAtual } from '../../shared/relogio';
import { FaixaPaciente } from '../../shared/faixa-paciente/faixa-paciente';
import { Icone } from '../../shared/icone/icone';
import { Perfil } from '../../shared/perfil';
import { TituloPagina } from '../../shared/titulo-pagina/titulo-pagina';
import { formatarData } from '../../shared/util';

/** Prontuário do paciente: dados pessoais, responsável, últimas informações e atalhos para as seções. */
@Component({
  selector: 'app-prontuario',
  imports: [FaixaPaciente, Icone, RouterLink, TituloPagina],
  templateUrl: './prontuario.html',
})
export class Prontuario {
  private readonly clinica = inject(Clinica);

  /** Vem da rota: /:perfil/pacientes/:id */
  readonly id = input.required<string>();
  /** Vem do `data` da rota (secretaria ou admin). */
  readonly perfil = input<Perfil>('secretaria');
  protected readonly raiz = computed(() => `/${this.perfil()}`);

  protected readonly paciente = computed(() => this.clinica.paciente(this.id()));
  protected readonly nascimento = computed(() => formatarData(this.paciente()?.nascimento));
  protected readonly secoes = computed(() => secoesDoPerfil(this.perfil()).map((id) => SECOES[id]));

  /** A próxima consulta marcada (a partir de hoje, sem contar as canceladas). */
  protected readonly proxima = computed(() => {
    const a = this.clinica
      .agendamentos()
      .filter((x) => x.pacienteId === this.id() && x.status !== 'cancelado' && x.data >= hojeAtual())
      .sort((x, y) => (x.data + x.inicio).localeCompare(y.data + y.inicio))[0];
    if (!a) return null;
    const prof = this.clinica.profissional(a.profissionalId);
    return { data: formatarData(a.data), profissional: prof ? rotuloProfissional(prof) : '—' };
  });

  /** A consulta mais recente do histórico do paciente. */
  protected readonly ultima = computed(() => {
    const c = this.paciente()?.consultas[0];
    return c ? { data: formatarData(c.data), profissional: c.profissional } : null;
  });
}
