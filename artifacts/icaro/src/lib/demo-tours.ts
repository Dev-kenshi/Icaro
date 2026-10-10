export type TourStep = { title: string; body: string };
export type DemoTour = { id: 'discipulus' | 'labeducontabil'; name: string; tagline: string; steps: TourStep[] };

export const DEMO_TOURS: DemoTour[] = [
  {
    id: 'discipulus',
    name: 'Discipulus',
    tagline: 'Gestão contábil integrada para paróquias e cúrias',
    steps: [
      { title: 'O que é', body: 'Sistema de gestão contábil integrada para organizações religiosas (paróquias, cúrias e o clero), criado pelo professor Rômulo. Reúne Pessoal, Contábil e Fiscal sobre a mesma base: a paróquia registra, as regras validam, a contabilidade recebe e a Cúria acompanha. Funciona no navegador, com acesso por perfil (ecônomo diocesano, contadora diocesana, pároco e tesoureira) e ambiente de demonstração.' },
      { title: 'Gestão da Cúria', body: 'Controle das paróquias com entradas, saídas, dívidas, dívidas vencidas e funcionários de cada unidade. Painel financeiro com indicadores de autossustentação e de reserva operacional em meses. Consolidação diocesana que soma as paróquias e elimina os repasses internos, com cálculo da taxa diocesana devida. Estrutura eclesial (arquidiocese, foranias, paróquias, comunidades e capelas) define quem escritura, quem é centro de custo e para onde sobem os repasses.' },
      { title: 'Contabilidade', body: 'Lançamento por natureza do fato (dízimo, coleta, espórtula, doações, repasses): débito e crédito derivados automaticamente, por partidas dobradas. Lançamento não se edita nem se apaga: corrige-se por estorno. Plano de contas referencial com 280 contas estruturado para a ITG 2002 (R1). Demonstrações conforme a ITG 2002 (R1) e, subsidiariamente, a NBC TG 1000 (R1). Prestação de contas mensal pronta para conferência, assinatura e envio à Cúria.' },
      { title: 'Dízimo, sacramentos e LGPD', body: 'O dízimo é registrado na origem e vai sozinho para a contabilidade. Como o registro nominal revela convicção religiosa — dado pessoal sensível (LGPD, art. 5º, II) — o lançamento nominal exige consentimento específico; sem ele, registra-se como oferta anônima, com pseudonimização no envio à Cúria. Nos sacramentos, o assento no livro e o lançamento da espórtula são o mesmo ato, conferido com a tabela diocesana vigente.' },
      { title: 'Pessoal, fiscal e conformidade', body: 'Departamento pessoal: admissão, folha, benefícios, provisões, jornada, férias, desligamento e eSocial. Fiscal: documentos fiscais, retenções de IR, INSS, ISS e contribuições, e o calendário de obrigações acessórias (eSocial, EFD-Reinf, DCTFWeb, ECD e ECF). A imunidade alcança impostos, mas não dispensa obrigações acessórias (CF/88, art. 150, § 4º; CTN, art. 14, III), deduzidas do perfil real da unidade.' },
      { title: 'Controles e auditoria', body: 'Regras e parâmetros diocesanos (41 regras ativas na demonstração), sempre com decreto de referência. Fechamento mensal com portão de qualidade: com pendência bloqueante, a competência não fecha. Recepção das prestações de contas pela Cúria, com devolução motivada. Trilha de auditoria encadeada por hash: alterar ou remover um registro rompe a cadeia, e o sistema aponta exatamente onde.' },
    ],
  },
  {
    id: 'labeducontabil',
    name: 'LabEduContábil UEFS',
    tagline: 'Laboratório didático de contabilidade que integra academia e mercado',
    steps: [
      { title: 'O que é', body: 'O LabEduContábil (LABCONTÁBIL EDU) é o laboratório didático de contabilidade da UEFS criado pelo professor Rômulo. Simula um ERP de escritório contábil, com acesso de professor e alunos (cadastro, aprovação pelo professor e turma) e uma base didática de 30 empresas carregável com um clique.' },
      { title: 'Cadastro e contabilidade', body: 'Empresas com cadastro integrado a todas as abas. Plano de contas por empresa, com modelo didático. Contrato social elaborado automaticamente (sócios, capital, quotas, administração, objeto, prazo e foro). Contabilidade com lançamentos, importação da fiscal, livro diário, razão e balancete.' },
      { title: 'Escrita fiscal', body: 'Notas fiscais (NF-e, NFC-e, CT-e, NFS-e), importação e exportação de XML, apuração por período, ICMS, IPI, PIS e Cofins, e campos de IBS e CBS para a fase de transição da reforma tributária.' },
      { title: 'Pessoal e obrigações', body: 'Folha de pagamento com admissão completa e dados do eSocial. INSS patronal (RAT, FAP, terceiros) e eSocial por eventos do leiaute S-1.3. Central de obrigações acessórias conforme regime, atividade e localização.' },
      { title: 'Gestão e relatórios', body: 'Planejamento tributário comparando cenários. Financeiro (contas a pagar e a receber, com contabilização). Patrimônio com cálculo de depreciação. Relatórios contábeis: balancete, DRE, balanço, diário e razão. IA contábil didática local, que analisa os dados sem enviá-los para fora do arquivo. Modo professor e gestão da turma.' },
    ],
  },
];

export function tourById(id: string | null | undefined): DemoTour | null {
  return DEMO_TOURS.find((tour) => tour.id === id) ?? null;
}

export function tourStep(tour: DemoTour, index: number): TourStep | null {
  return index >= 0 && index < tour.steps.length ? tour.steps[index] : null;
}

export type TourCommand = 'next' | 'previous' | 'pause' | 'resume' | 'close';

/** Maps voice phrases used during the guided tour, per the ICARO v5 spec. */
export function parseTourCommand(normalized: string): TourCommand | null {
  if (/\b(proximo|proxima|avance|avancar)\b/.test(normalized)) return 'next';
  if (/\b(volte|voltar|anterior)\b/.test(normalized)) return 'previous';
  if (/\b(pausa|pausar|pause)\b/.test(normalized)) return 'pause';
  if (/\b(continue|continuar|retome|retomar)\b/.test(normalized)) return 'resume';
  if (/\b(feche|fechar|encerrar|sair)\b.*\b(sistema|tour|demonstracao|apresentacao)\b/.test(normalized)) return 'close';
  return null;
}

export function parseOpenTour(normalized: string): DemoTour['id'] | null {
  if (!/\b(mostre|mostrar|mostra|exibir|exiba|abrir|abra|apresente|ver)\b/.test(normalized)) return null;
  if (/\bdiscipulus\b/.test(normalized)) return 'discipulus';
  if (/\blab\s*edu|labeducontabil|laboratorio didatico\b/.test(normalized)) return 'labeducontabil';
  return null;
}
