import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Aviso } from '../../shared/aviso/aviso';
import { Clinica } from '../../shared/clinica/clinica';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Icone } from '../../shared/icone/icone';
import { Perfil } from '../../shared/perfil';
import { TituloPagina } from '../../shared/titulo-pagina/titulo-pagina';
import { cpfValido, deISO, emailValido, formatarCpf, formatarTelefone, idadeDe, telefoneValido } from '../../shared/util';

interface Formulario {
  nome: string; nascimento: string; cpf: string; cep: string; cidade: string; endereco: string; numero: string; complemento: string; bairro: string;
  inicio: string; encerramento: string;
  ativo: boolean;
  /** Foto já cadastrada (não é editada neste formulário; só é mantida ao salvar). */
  foto: string;
  rNome: string; rCpf: string; rTelefone: string; rEmail: string; rParentesco: string;
}

type Campo = keyof Formulario;

const VAZIO: Formulario = {
  nome: '', nascimento: '', cpf: '', cep: '', cidade: '', endereco: '', numero: '', complemento: '', bairro: '',
  inicio: '', encerramento: '', ativo: true, foto: '',
  rNome: '', rCpf: '', rTelefone: '', rEmail: '', rParentesco: '',
};

/** Máscara DD/MM/AAAA. */
function mascaraData(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  return n.length <= 4 ? `${n.slice(0, 2)}/${n.slice(2)}` : `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

/** Máscara 00000-000. */
function mascaraCep(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 8);
  return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
}

/** 'DD/MM/AAAA' -> 'aaaa-mm-dd' ('' se não for uma data real). */
function dataParaISO(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return '';
  const [, d, mes, a] = m;
  const data = new Date(Number(a), Number(mes) - 1, Number(d));
  const real = data.getFullYear() === Number(a) && data.getMonth() === Number(mes) - 1 && data.getDate() === Number(d);
  return real ? `${a}-${mes}-${d}` : '';
}

const dataBR = (iso?: string | null): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Cadastrar novo paciente ou editar um paciente existente. */
@Component({
  selector: 'app-paciente-form',
  imports: [Dialogo, Icone, TituloPagina],
  templateUrl: './paciente-form.html',
})
export class PacienteForm {
  private readonly clinica = inject(Clinica);
  private readonly aviso = inject(Aviso);
  private readonly router = inject(Router);

  readonly perfil = input<Perfil>('secretaria');
  /** Sem id = cadastro novo. */
  readonly id = input<string>();

  protected readonly f = signal<Formulario>({ ...VAZIO });
  protected readonly tentou = signal(false);
  protected readonly confirmando = signal(false);

  private carregado = false;

  protected readonly edicao = computed(() => !!this.id());
  protected readonly existente = computed(() => this.clinica.paciente(this.id()));
  protected readonly voltar = computed(() => `/${this.perfil()}/pacientes`);

  private readonly nascimentoISO = computed(() => dataParaISO(this.f().nascimento));

  protected readonly menorDeIdade = computed(() => {
    const n = this.nascimentoISO();
    return !!n && idadeDe(n) < 18;
  });

  /** Mensagens de erro de cada campo (vazio = campo certo). */
  protected readonly erros = computed(() => {
    const f = this.f();
    const e: Partial<Record<Campo, string>> = {};
    if (f.nome.trim().length < 3) e.nome = 'Informe o nome completo.';
    if (!f.nascimento) e.nascimento = 'Informe a data de nascimento.';
    else if (!this.nascimentoISO()) e.nascimento = 'Data inválida. Use DD/MM/AAAA.';
    else if (deISO(this.nascimentoISO()) > new Date()) e.nascimento = 'A data não pode ser no futuro.';
    if (!f.cpf.trim()) e.cpf = 'Informe o CPF.';
    else if (!cpfValido(f.cpf)) e.cpf = 'CPF inválido.';
    if (!f.cep.trim()) e.cep = 'Informe o CEP.';
    else if (f.cep.replace(/\D/g, '').length !== 8) e.cep = 'CEP inválido.';
    if (!f.cidade.trim()) e.cidade = 'Informe a cidade.';
    if (!f.endereco.trim()) e.endereco = 'Informe o endereço.';
    if (!f.numero.trim()) e.numero = 'Informe o número.';
    if (!f.bairro.trim()) e.bairro = 'Informe o bairro.';

    const inicio = dataParaISO(f.inicio);
    const fim = dataParaISO(f.encerramento);
    if (!f.inicio) e.inicio = 'Informe a data de início.';
    else if (!inicio) e.inicio = 'Data inválida. Use DD/MM/AAAA.';
    if (f.encerramento && !fim) e.encerramento = 'Data inválida. Use DD/MM/AAAA.';
    else if (inicio && fim && fim < inicio) e.encerramento = 'Não pode ser antes da data de início.';

    // O responsável é obrigatório só para menores de 18 anos; se for preenchido, os dados precisam estar certos.
    if (this.menorDeIdade()) {
      if (!f.rNome.trim()) e.rNome = 'Paciente menor de idade: informe o responsável.';
      if (!f.rCpf.trim()) e.rCpf = 'Informe o CPF do responsável.';
      if (!f.rTelefone.trim()) e.rTelefone = 'Informe o telefone do responsável.';
      if (!f.rParentesco.trim()) e.rParentesco = 'Informe o grau de parentesco.';
    }
    if (f.rCpf.trim() && !cpfValido(f.rCpf)) e.rCpf = 'CPF inválido.';
    if (f.rTelefone.trim() && !telefoneValido(f.rTelefone)) e.rTelefone = 'Telefone inválido.';
    if (f.rEmail.trim() && !emailValido(f.rEmail)) e.rEmail = 'E-mail inválido.';
    return e;
  });

  constructor() {
    // Na edição, preenche o formulário com os dados do paciente (uma vez).
    effect(() => {
      const p = this.existente();
      if (this.carregado || !p) return;
      this.carregado = true;
      const semTraco = (v?: string) => (!v || v === '—' ? '' : v);
      this.f.set({
        nome: p.nome, nascimento: dataBR(p.nascimento), cpf: p.cpf, cep: p.cep ?? '', cidade: p.cidade ?? '',
        endereco: semTraco(p.endereco), numero: p.numero ?? '', complemento: p.complemento ?? '', bairro: p.bairro ?? '',
        inicio: dataBR(p.diagnostico.inicioTratamento), encerramento: dataBR(p.encerramento),
        ativo: p.status !== 'inativo', foto: p.foto ?? '',
        rNome: semTraco(p.responsavel.nome), rCpf: p.responsavel.cpf ?? '', rTelefone: semTraco(p.responsavel.telefone),
        rEmail: p.responsavel.email ?? '', rParentesco: semTraco(p.responsavel.relacao),
      });
    });
  }

  protected mostrarErro(campo: Campo): string {
    return this.tentou() ? (this.erros()[campo] ?? '') : '';
  }

  protected digitar(campo: Campo, evento: Event): void {
    let valor = (evento.target as HTMLInputElement).value;
    if (campo === 'cpf' || campo === 'rCpf') valor = formatarCpf(valor);
    if (campo === 'rTelefone') valor = formatarTelefone(valor);
    if (campo === 'nascimento' || campo === 'inicio' || campo === 'encerramento') valor = mascaraData(valor);
    if (campo === 'cep') valor = mascaraCep(valor);
    this.f.update((atual) => ({ ...atual, [campo]: valor }));
    // O campo mostra a máscara mesmo se o navegador tentar guardar o texto digitado.
    (evento.target as HTMLInputElement).value = valor;
  }

  protected definir<K extends Campo>(campo: K, valor: Formulario[K]): void {
    this.f.update((atual) => ({ ...atual, [campo]: valor }));
  }

  protected cadastrar(): void {
    this.tentou.set(true);
    if (Object.keys(this.erros()).length) {
      this.aviso.mostrar('Corrija os campos destacados para continuar.');
      return;
    }
    this.confirmando.set(true);
  }

  protected confirmar(): void {
    const f = this.f();
    const paciente = this.clinica.salvarPaciente(
      {
        nome: f.nome.trim(), nascimento: this.nascimentoISO(), cpf: f.cpf, cep: f.cep, cidade: f.cidade.trim(), endereco: f.endereco.trim(),
        numero: f.numero.trim(), complemento: f.complemento.trim(), bairro: f.bairro.trim(),
        inicio: dataParaISO(f.inicio), encerramento: dataParaISO(f.encerramento),
        responsavel: { nome: f.rNome.trim(), email: f.rEmail.trim(), relacao: f.rParentesco.trim(), telefone: f.rTelefone, cpf: f.rCpf },
        ativo: f.ativo, foto: f.foto,
      },
      this.id(),
    );
    this.confirmando.set(false);
    this.aviso.mostrar(this.edicao() ? `Dados de ${paciente.nome} atualizados.` : 'Paciente cadastrado com sucesso.');
    this.router.navigateByUrl(this.voltar());
  }

  protected cancelar(): void {
    this.router.navigateByUrl(this.voltar());
  }
}
