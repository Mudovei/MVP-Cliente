import { Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Aviso } from '../../shared/aviso/aviso';
import { anexoDe, baixarDocumento, compartilharLink, ehImagem, semExtensao } from '../../shared/clinica/arquivos';
import { Clinica } from '../../shared/clinica/clinica';
import { Documento, Secao } from '../../shared/clinica/modelos';
import { SECOES, secaoDoPerfil } from '../../shared/clinica/secoes';
import { FaixaPaciente } from '../../shared/faixa-paciente/faixa-paciente';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Icone } from '../../shared/icone/icone';
import { Perfil } from '../../shared/perfil';
import { TituloPagina } from '../../shared/titulo-pagina/titulo-pagina';
import { formatarData, normalizar, paraISO, resumoTexto } from '../../shared/util';

/**
 * Tela de uma seção do prontuário: /:perfil/pacientes/:id/:secao
 * - Evoluções, laudos, encaminhamentos e atestados do psicólogo: galeria de documentos (miniaturas).
 * - As outras seções mostram a lista de documentos.
 */
@Component({
  selector: 'app-secao-paciente',
  imports: [Dialogo, FaixaPaciente, Icone, RouterLink, TituloPagina],
  templateUrl: './secao-paciente.html',
  host: { '(document:click)': 'fecharMenu($event)' },
})
export class SecaoPaciente {
  private readonly clinica = inject(Clinica);
  private readonly aviso = inject(Aviso);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** Vem do `data` da rota (secretaria ou admin). */
  readonly perfil = input<Perfil>('secretaria');
  protected readonly raiz = computed(() => `/${this.perfil()}`);
  readonly secao = input.required<string>();

  private readonly arquivoCampo = viewChild<ElementRef<HTMLInputElement>>('arquivo');
  private readonly menuRaiz = viewChild<ElementRef<HTMLElement>>('menuCaixa');

  protected readonly paciente = computed(() => this.clinica.paciente(this.id()));
  protected readonly secaoValida = computed<Secao | null>(() => secaoDoPerfil(this.secao(), this.perfil()));
  protected readonly cfg = computed(() => SECOES[this.secaoValida() ?? 'laudos']);

  protected readonly dataFiltro = signal('');
  protected readonly tipoFiltro = signal('');
  protected readonly busca = signal('');
  protected readonly menuNovo = signal(false);
  protected readonly hoje = paraISO(new Date());

  // ----- Galeria de documentos -----
  protected readonly filtroDoc = signal('');
  /** Grupo que recebe os arquivos enviados (só nas seções com grupos). */
  protected readonly grupoEnvio = signal('');
  /** Janela que pergunta em qual grupo os arquivos serão adicionados. */
  protected readonly escolhendoGrupo = signal(false);

  private paraCartao(doc: Documento) {
    const arquivo = doc.arquivo;
    const imagem = !!arquivo && ehImagem(arquivo.nome);
    return {
      doc,
      dataBR: formatarData(doc.dataSessao),
      imagem,
      /** Imagem enviada: o próprio arquivo. Texto escrito no sistema: um trecho, como numa folha em miniatura. */
      miniatura: arquivo ? (imagem ? arquivo.url : '') : resumoTexto(doc.conteudo),
    };
  }

  protected readonly galeria = computed(() => {
    const todos = this.clinica.documentosDe(this.id(), this.secaoValida() ?? undefined).map((d) => this.paraCartao(d));
    const escolhido = this.filtroDoc();
    const visiveis = escolhido ? todos.filter((c) => c.doc.id === escolhido) : todos;
    const grupos = this.cfg().grupos;
    return {
      todos,
      total: visiveis.length,
      // Seções com grupos mostram todos os grupos (mesmo vazios); sem grupos, só os que têm documentos.
      grupos: grupos ? grupos.map((rotulo) => ({ rotulo, itens: visiveis.filter((c) => (c.doc.grupo ?? grupos[0]) === rotulo) })) : [
        { rotulo: 'Fotos de documentos de identificação do paciente', itens: visiveis.filter((c) => !!c.doc.arquivo) },
        { rotulo: 'Documentos escritos no sistema', itens: visiveis.filter((c) => !c.doc.arquivo) },
      ].filter((g) => g.itens.length),
    };
  });

  protected readonly itens = computed(() => {
    const termo = normalizar(this.busca());
    return this.clinica
      .documentosDe(this.id(), this.secaoValida() ?? undefined)
      .filter((d) => !this.dataFiltro() || d.dataSessao === this.dataFiltro())
      .filter((d) => !this.tipoFiltro() || d.tipoAtendimento === this.tipoFiltro())
      .filter((d) => !termo || normalizar(d.titulo).includes(termo))
      .map((d) => ({ doc: d, dataBR: formatarData(d.dataSessao) }));
  });

  protected readonly dados = computed(() => {
    const p = this.paciente();
    return [
      { icone: 'arquivo-texto' as const, rotulo: 'Diagnóstico principal', valor: p?.diagnostico.principal ?? '—' },
      { icone: 'relogio' as const, rotulo: 'CID', valor: `(${p?.diagnostico.cid ?? '—'})` },
      { icone: 'arquivo-mais' as const, rotulo: 'Início do tratamento', valor: formatarData(p?.diagnostico.inicioTratamento) },
    ];
  });

  protected fecharMenu(evento: Event): void {
    if (this.menuNovo() && !this.menuRaiz()?.nativeElement.contains(evento.target as Node)) this.menuNovo.set(false);
  }

  protected criarEmBranco(): void {
    this.menuNovo.set(false);
    this.router.navigate([this.raiz(), 'pacientes', this.id(), this.cfg().id, 'novo']);
  }

  protected escolherArquivo(): void {
    this.menuNovo.set(false);
    if ((this.cfg().grupos?.length ?? 0) > 1) {
      this.escolhendoGrupo.set(true);
      return;
    }
    this.arquivoCampo()?.nativeElement.click();
  }

  protected confirmarGrupo(): void {
    this.escolhendoGrupo.set(false);
    this.arquivoCampo()?.nativeElement.click();
  }

  protected aoEnviar(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivos = Array.from(campo.files ?? []);
    campo.value = '';
    if (!arquivos.length) return;
    const grupos = this.cfg().grupos;
    for (const arquivo of arquivos) {
      this.clinica.salvarDocumento({
        pacienteId: this.id(), secao: this.cfg().id, titulo: semExtensao(arquivo.name),
        dataSessao: this.dataFiltro() || this.hoje,
        tipoAtendimento: this.tipoFiltro() === 'Online' ? 'Online' : 'Presencial',
        conteudo: '', anexos: [], arquivo: anexoDe(arquivo),
        grupo: grupos ? this.grupoEnvio() || grupos[0] : undefined,
      });
    }
    this.aviso.mostrar(arquivos.length > 1 ? 'Arquivos enviados com sucesso.' : 'Arquivo enviado com sucesso.');
  }

  protected baixar(doc: Documento): void {
    baixarDocumento(doc);
  }

  protected async compartilhar(doc: Documento): Promise<void> {
    const url = `${location.origin}${this.raiz()}/pacientes/${doc.pacienteId}/${doc.secao}/${doc.id}`;
    const resultado = await compartilharLink(doc.titulo, url);
    if (resultado === 'copiado') this.aviso.mostrar('Link copiado para a área de transferência.');
    else if (resultado === 'erro') this.aviso.mostrar('Não foi possível compartilhar o documento.');
  }
}
