/**
 * Dados públicos do I ITCONT, copiados da página oficial do Even3 (mesma fonte do seed
 * lib/db/src/seed/itcont.ts). Fonte única do site: nenhuma data, horário ou nome é
 * escrito à mão nos componentes. Imagens ficam como links do Even3 (não copiar arquivos).
 * Desenvolvedor do projeto: Emanuel Macêdo Luz
 */

export type Sessao = {
  id: string;
  data: string; // AAAA-MM-DD
  inicio: string; // HH:MM, horário de Brasília
  fim: string;
  titulo: string;
  tipo: 'palestra' | 'bate-papo';
};

export type Convidado = { nome: string; foto: string };

export const FONTE_OFICIAL = 'https://www.even3.com.br/i-imersao-tecnologica-contabil-itcont-786544/';

export const ITCONT = {
  slug: 'i-imersao-tecnologica-contabil-itcont-786544',
  sigla: 'ITCONT',
  edicao: 'I',
  titulo: 'I Imersão Tecnológica Contábil',
  tituloOficial: 'I IMERSÃO TECNOLÓGICA CONTÁBIL - ITCONT',
  slogan: ['Inovação', 'Prática', 'Conexões'] as const,
  missao: 'Para o futuro da contabilidade',
  chamada: 'A Contabilidade está em transformação, e você faz parte desse futuro!',
  resumo: 'Imersão da UEFS sobre inteligência artificial, tecnologia e transformação da contabilidade.',
  descricao:
    'A I Imersão Tecnológica Contábil da UEFS reúne estudantes, professores e profissionais para explorar como a inteligência artificial e as tecnologias digitais estão transformando a atuação contábil e a gestão dos negócios. Realizado pelo Projeto de Extensão Contador do Amanhã, o evento promove aprendizado e troca de experiências entre universidade e mercado.',
  fechamento: 'Participe dessa imersão em conhecimento, inovação e prática. O futuro da Contabilidade começa aqui!',
  inicio: '2026-10-21',
  fim: '2026-10-22',
  fuso: 'America/Sao_Paulo',
  offset: '-03:00',
  local: {
    nome: 'Auditório III do Módulo IV da UEFS',
    endereco: 'UEFS - Módulo 4',
    cidade: 'Feira de Santana',
    estado: 'Bahia',
    uf: 'BA',
    pais: 'Brasil',
    instituicao: 'Universidade Estadual de Feira de Santana',
  },
  realizacao: 'Projeto de Extensão Contador do Amanhã',
  vinculo: ['Colegiado de Ciências Contábeis', 'DCIS', 'UEFS'],
  organizador: 'Rômulo Benício Lucena Filho',
  inscricaoUrl: FONTE_OFICIAL,
  fonteUrl: FONTE_OFICIAL,
  banner:
    'https://images.even3.com/r8RCndpF10pM-_B0T5c98u5vpvk=/1100x440/smart/https://static.even3.com/banner/ImagemdoCodex21deset.de202609_39_23.1de17c125c3e4604ae15.png',
  logo:
    'https://images.even3.com/LYNI1hek0HIFo4KZJ9ACbooN8JI=/fit-in/250x250/smart/https://static.even3.com/logos/ImagemdoCodex21deset.de202609_39_23.91a8f584302f4c68b0fa.png',
  categorias: [
    { nome: 'Graduação', precoCentavos: 0 },
    { nome: 'Docente', precoCentavos: 0 },
    { nome: 'Profissional Contábil', precoCentavos: 0 },
  ],
  inscricoesAte: '2026-10-22',
  sessoes: [
    { id: 'ia-rotina', data: '2026-10-21', inicio: '19:00', fim: '21:00', titulo: 'Uso da Inteligência Artificial na Rotina Contábil', tipo: 'palestra' },
    { id: 'bate-papo', data: '2026-10-22', inicio: '19:00', fim: '20:00', titulo: 'Bate-Papo Tecnológico Contábil', tipo: 'bate-papo' },
    { id: 'ia-estrategia', data: '2026-10-22', inicio: '20:00', fim: '21:30', titulo: 'Inteligência Artificial e Inovação como Estratégia Empresarial', tipo: 'palestra' },
  ] satisfies Sessao[],
  convidados: [
    { nome: 'André Dedeko', foto: 'https://images.even3.com/Pfs0OmLNmC7oasHh-6du61rrKRQ=/150x150/smart/https://static.even3.com/geral/AndrDedeko.041f4a39b488448d9c94.jpeg' },
    { nome: 'Anna Clara', foto: 'https://images.even3.com/QoVHgT2YRPt5QOtxYMVtL0gds0Q=/150x150/smart/https://static.even3.com/geral/WhatsAppImage2026-09-18at12.34.31.f3e37ca6fd6d4eea8b26.jpeg' },
    { nome: 'Luana Ávilla', foto: 'https://images.even3.com/awRm1PQPEw9qJ353rr6CG896Gx0=/150x150/smart/https://static.even3.com/geral/WhatsAppImage2026-09-21at08.30.19.f1c63848e83d41aea996.jpeg' },
    { nome: 'Matheus Neris', foto: 'https://images.even3.com/nIW1oK7NSvjcy--eDYrzVd1WOGM=/150x150/smart/https://static.even3.com/geral/IMG_3970.jpg.5774285325614bcc8069.jpeg' },
    { nome: 'Rízia Ríos', foto: 'https://images.even3.com/5rKdkwF9B3hFPqnM_HW2eQj72qM=/150x150/smart/https://static.even3.com/geral/RziaRos.3b83151459a049a6a541.jpeg' },
    { nome: 'Rômulo Benício', foto: 'https://images.even3.com/yynrGTJj7vGQcByACRzw7YB2_Vg=/150x150/smart/https://static.even3.com/geral/ImagemdoCodex21deset.de202611_13_05.39b256fc49dd45ae92d2.png' },
    { nome: 'Ângelo Loula', foto: 'https://images.even3.com/GvPLSfitDLHKinWEH0fRJQiRr54=/150x150/smart/https://static.even3.com/geral/AngeloLoula.04b03229b6ca4a79b89e.jpeg' },
  ] satisfies Convidado[],
  faq: [
    { p: 'A inscrição é paga?', r: 'Não. As três categorias (Graduação, Docente e Profissional Contábil) são gratuitas. A inscrição é feita na página oficial do evento no Even3.' },
    { p: 'Quando e onde acontece?', r: 'Nos dias 21 e 22 de outubro de 2026, a partir das 19h, no Auditório III do Módulo IV da UEFS, em Feira de Santana (BA).' },
    { p: 'O evento é presencial ou online?', r: 'Presencial, no campus da UEFS.' },
    { p: 'Quem pode participar?', r: 'Estudantes, professores e profissionais da contabilidade e da gestão, e a comunidade interessada no futuro da profissão.' },
    { p: 'Quem realiza o evento?', r: 'O Projeto de Extensão Contador do Amanhã, do curso de Ciências Contábeis da UEFS.' },
    { p: 'Até quando posso me inscrever?', r: 'As inscrições ficam abertas até 22 de outubro de 2026, pela página oficial do evento no Even3.' },
  ],
  creditos: 'Emanuel Macêdo Luz, desenvolvedor do projeto',
} as const;

export type Itcont = typeof ITCONT;
