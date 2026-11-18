import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Aviso } from '../../shared/aviso/aviso';
import { Clinica } from '../../shared/clinica/clinica';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Icone } from '../../shared/icone/icone';
import { Perfil } from '../../shared/perfil';
import { TituloPagina } from '../../shared/titulo-pagina/titulo-pagina';
import {
  cpfValido, deISO, emailValido, formatarCpf, formatarTelefone, gerarSenhaTemporaria, idadeDe, paraISO, telefoneValido,
} from '../../shared/util';

interface Formulario {
  nome: string; nascimento: string; cpf: string; telefone: string; cidade: string; cep: string; bairro: string;
  endereco: string; numero: string; complemento: string;
  cargo: string; admissao: string; ativo: boolean;
  emailAcesso: string; senha: string; boasVindas: boolean;
}
type Campo = keyof Formulario;

const VAZIO: Formulario = {
  nome: '', nascimento: '', cpf: '', telefone: '', cidade: '', cep: '', bairro: '', endereco: '', numero: '', complemento: '',
  cargo: 'Secretária', admissao: '', ativo: true, emailAcesso: '', senha: '', boasVindas: false,
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

/** Cadastrar nova secretária ou editar uma secretária existente (administrador). */
@Component({
  selector: 'app-secretaria-form',
  imports: [Dialogo, Icone, TituloPagina],
  templateUrl: './secretaria-form.html',
})
export class SecretariaForm {
  private readonly clinica = inject(Clinica);
  private readonly aviso = inject(Aviso);
  private readonly router = inject(Router);

  readonly perfil = input<Perfil>('admin');
  readonly id = input<string>();

  protected readonly hoje = paraISO(new Date());
  protected readonly f = signal<Formulario>({ ...VAZIO });
  protected readonly tentou = signal(false);
  protected readonly confirmando = signal(false);

  private carregado = false;

  protected readonly edicao = computed(() => !!this.id());
  protected readonly existente = computed(() => this.clinica.secretaria(this.id()));
  protected readonly voltar = computed(() => `/${this.perfil()}/secretarias`);

  private readonly nascimentoISO = computed(() => dataParaISO(this.f().nascimento));
  private readonly admissaoISO = computed(() => dataParaISO(this.f().admissao));

  protected readonly erros = computed(() => {
    const f = this.f();
    const e: Partial<Record<Campo, string>> = {};
    if (f.nome.trim().length < 3) e.nome = 'Informe o nome completo.';
    if (!f.nascimento) e.nascimento = 'Informe a data de nascimento.';
    else if (!this.nascimentoISO()) e.nascimento = 'Data inválida. Use DD/MM/AAAA.';
    else if (idadeDe(this.nascimentoISO()) < 16 || deISO(this.nascimentoISO()) > new Date()) e.nascimento = 'Data de nascimento inválida.';
    if (!f.cpf.trim()) e.cpf = 'Informe o CPF.';
    else if (!cpfValido(f.cpf)) e.cpf = 'CPF inválido.';
    if (f.telefone.trim() && !telefoneValido(f.telefone)) e.telefone = 'Telefone inválido.';
    if (!f.cidade.trim()) e.cidade = 'Informe a cidade.';
    if (!f.cep.trim()) e.cep = 'Informe o CEP.';
    else if (f.cep.replace(/\D/g, '').length !== 8) e.cep = 'CEP inválido.';
    if (!f.cargo.trim()) e.cargo = 'Informe o cargo.';
    if (f.admissao) {
      if (!this.admissaoISO()) e.admissao = 'Data inválida. Use DD/MM/AAAA.';
      else if (deISO(this.admissaoISO()) > new Date()) e.admissao = 'A data não pode ser no futuro.';
    }
    if (!f.emailAcesso.trim()) e.emailAcesso = 'Informe o usuário (e-mail de acesso).';
    else if (!emailValido(f.emailAcesso)) e.emailAcesso = 'E-mail inválido.';
    else if (this.clinica.emailDeAcessoEmUso(f.emailAcesso, this.id())) e.emailAcesso = 'Esse e-mail de acesso já está em uso.';
    if ((!this.edicao() || f.senha) && f.senha.length < 6) e.senha = 'A senha precisa ter 6 caracteres ou mais.';
    return e;
  });

  constructor() {
    effect(() => {
      const s = this.existente();
      if (this.carregado || !s) return;
      this.carregado = true;
      this.f.set({
        nome: s.nome, nascimento: dataBR(s.nascimento), cpf: s.cpf, telefone: s.telefone, cidade: s.cidade ?? '', cep: s.cep ?? '',
        bairro: s.bairro ?? '', endereco: s.endereco, numero: s.numero ?? '', complemento: s.complemento ?? '',
        cargo: s.cargo, admissao: dataBR(s.admissao), ativo: s.ativo, emailAcesso: s.emailAcesso, senha: '', boasVindas: false,
      });
    });
  }

  protected mostrarErro(campo: Campo): string {
    return this.tentou() ? (this.erros()[campo] ?? '') : '';
  }

  protected digitar(campo: Campo, evento: Event): void {
    let valor = (evento.target as HTMLInputElement).value;
    if (campo === 'cpf') valor = formatarCpf(valor);
    if (campo === 'telefone') valor = formatarTelefone(valor);
    if (campo === 'cep') valor = mascaraCep(valor);
    if (campo === 'nascimento' || campo === 'admissao') valor = mascaraData(valor);
    this.f.update((atual) => ({ ...atual, [campo]: valor }));
    (evento.target as HTMLInputElement).value = valor;
  }

  protected definir<K extends Campo>(campo: K, valor: Formulario[K]): void {
    this.f.update((atual) => ({ ...atual, [campo]: valor }));
  }

  protected gerarSenha(): void {
    this.definir('senha', gerarSenhaTemporaria());
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
    const secretaria = this.clinica.salvarSecretaria(
      {
        nome: f.nome.trim(), nascimento: this.nascimentoISO(), telefone: f.telefone, email: f.emailAcesso.trim(), cpf: f.cpf,
        endereco: f.endereco.trim() || '—', cep: f.cep, cidade: f.cidade.trim(), bairro: f.bairro.trim(), numero: f.numero.trim(),
        complemento: f.complemento.trim(), cargo: f.cargo.trim(), admissao: this.admissaoISO(), ativo: f.ativo, emailAcesso: f.emailAcesso.trim(),
      },
      this.id(),
    );
    // TODO (back-end): gravar a senha temporária com segurança e enviar o e-mail de boas-vindas (f.boasVindas).
    this.confirmando.set(false);
    if (this.edicao()) this.aviso.mostrar(`Dados de ${secretaria.nome} atualizados.`);
    else this.aviso.mostrar(`Secretária cadastrada. Senha: ${f.senha}`, 9000);
    this.router.navigateByUrl(this.voltar());
  }

  protected cancelar(): void {
    this.router.navigateByUrl(this.voltar());
  }
}
