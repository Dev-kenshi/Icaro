import { useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Bot, Send } from 'lucide-react';
import { ITCONT } from '../dados';
import { responderSobreItcont } from '../inteligencia';

type Mensagem = { id: number; papel: 'assistente' | 'visitante'; texto: string; fonte?: string; link?: string };
const perguntasSugestao = [
  { id: 'programacao', texto: 'Qual é a programação?' },
  { id: 'local', texto: 'Onde acontece?' },
  { id: 'convidados', texto: 'Quem são os convidados?' },
  { id: 'inscricao', texto: 'A inscrição é gratuita?' },
];

export default function InteligenciaEvento() {
  const [pergunta, setPergunta] = useState('');
  const [mensagens, setMensagens] = useState<Mensagem[]>([{
    id: 0,
    papel: 'assistente',
    texto: `Olá. Posso ajudar com dúvidas do ${ITCONT.sigla} usando apenas os dados oficiais e o FAQ desta página.`,
    fonte: 'Respostas locais, sem login ou chamada a serviços externos.',
  }]);
  const proximoId = useRef(1);

  const perguntar = (texto: string) => {
    const perguntaLimpa = texto.trim();
    if (!perguntaLimpa || perguntaLimpa.length > 300) return;
    const resposta = responderSobreItcont(perguntaLimpa);
    const idVisitante = proximoId.current;
    setMensagens((atuais) => [
      ...atuais,
      { id: idVisitante, papel: 'visitante', texto: perguntaLimpa },
      { id: idVisitante + 1, papel: 'assistente', texto: resposta.texto, fonte: resposta.fonte, link: resposta.url },
    ]);
    proximoId.current += 2;
    setPergunta('');
  };

  const enviar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    perguntar(pergunta);
  };

  return (
    <section className="itc-intelligence itc-card" aria-labelledby="itc-intelligence-title" data-testid="itcont-intelligence">
      <header className="itc-intelligence-head">
        <span className="itc-intelligence-icon"><Bot size={20} aria-hidden="true" /></span>
        <div>
          <span className="itc-eyebrow">Respostas com fonte oficial</span>
          <h3 id="itc-intelligence-title">Inteligência do ITCONT</h3>
          <p>Consulte o FAQ e os dados do evento. Sem login, chave ou serviços pagos.</p>
        </div>
      </header>

      <div className="itc-intelligence-log" role="log" aria-label="Conversa sobre o ITCONT" aria-live="polite" aria-relevant="additions">
        {mensagens.map((mensagem) => (
          <article className={`itc-intelligence-message is-${mensagem.papel}`} key={mensagem.id} data-testid={`itcont-message-${mensagem.id}`}>
            <p>{mensagem.texto}</p>
            {mensagem.fonte && <small>{mensagem.fonte}</small>}
            {mensagem.link && (
              <a href={mensagem.link} target="_blank" rel="noopener noreferrer" data-testid="link-intelligence-even3">
                Abrir página oficial do Even3 <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
          </article>
        ))}
      </div>

      <div className="itc-intelligence-prompts" aria-label="Perguntas sugeridas">
        {perguntasSugestao.map(({ id, texto }) => (
          <button type="button" key={id} className="itc-intelligence-prompt" onClick={() => perguntar(texto)} data-testid={`button-intelligence-${id}`}>
            {texto}
          </button>
        ))}
      </div>

      <form className="itc-intelligence-form" onSubmit={enviar}>
        <label className="sr-only" htmlFor="itc-intelligence-question">Sua pergunta sobre o ITCONT</label>
        <input
          id="itc-intelligence-question"
          value={pergunta}
          onChange={(event) => setPergunta(event.target.value.slice(0, 300))}
          placeholder="Pergunte sobre inscrição, programação, convidados ou local"
          maxLength={300}
          autoComplete="off"
          data-testid="input-intelligence-question"
        />
        <button type="submit" className="itc-primary" aria-label="Enviar pergunta" disabled={!pergunta.trim()} data-testid="button-intelligence-send">
          <span>Enviar</span><Send size={16} aria-hidden="true" />
        </button>
      </form>
      <p className="itc-intelligence-note">Se uma informação não estiver no FAQ ou nos dados oficiais, o assistente não vai inventar uma resposta.</p>
    </section>
  );
}
