import { useEffect, useRef, type ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';
import './stage-help.css';

type Props = { open: boolean; onOpen: () => void; onClose: () => void; clock: string; stateLabel: string; children?: ReactNode };

export function StageHelp({ open, onOpen, onClose, clock, stateLabel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open && was.current) trigger.current?.focus();
    was.current = open;
  }, [open]);
  return (
    <>
      <button ref={trigger} className="help-btn hbtn" onClick={onOpen} aria-label="Ajuda" aria-haspopup="dialog" data-testid="button-help"><HelpCircle size={18} /></button>
      <dialog ref={ref} className="stage-help" aria-labelledby="stage-help-title" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="stage-help-title" className="disp text-xl">ÍCARO</h2>
            <div className="mono text-[11px] opacity-70" data-testid="status-state">{stateLabel} · {clock}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar ajuda" data-testid="button-close-help"><X size={16} /></button>
        </div>
        <h3>Falar com o Ícaro</h3>
        <p>Diga “Ok, Ícaro” e faça sua pergunta. Também é possível tocar no microfone ou pressionar Enter, Espaço ou Page Down quando o foco não estiver em um campo ou botão. Cada ativação vale para uma pergunta; sem pergunta em 10 segundos, a escuta expira em silêncio.</p>
        <p>Para interromper, toque em <strong>Parar</strong> ou pressione Esc. O teclado ao lado do microfone abre a caixa para digitar.</p>
        <h3>Explorar as cenas em 3D</h3>
        <ul className="sh-list">
          <li>Arraste com o dedo ou o mouse para girar a Terra, o sistema solar ou a galáxia.</li>
          <li>Use pinça, roda do mouse ou os botões + e − para aproximar e afastar.</li>
          <li>Toque num planeta para segui-lo; “Soltar” encerra o acompanhamento.</li>
          <li>Toque duas vezes ou use “Recentralizar” para voltar à vista inicial.</li>
          <li>O botão de velocidade (0,5×, 1×, 2× ou 4×) ajusta o giro automático da Terra, dos planetas e da galáxia.</li>
        </ul>
        <h3>Atalhos de teclado</h3>
        <dl className="sh-keys">
          <dt><kbd>Enter</kbd> <kbd>Espaço</kbd> <kbd>Page Down</kbd></dt><dd>Ativar a escuta</dd>
          <dt><kbd>Esc</kbd></dt><dd>Parar a resposta ou fechar janelas</dd>
          <dt><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Girar a cena</dd>
          <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>Aproximar e afastar</dd>
          <dt><kbd>R</kbd></dt><dd>Recentralizar a vista</dd>
        </dl>
        <h3>O que pedir</h3>
        <p>Perguntas de contabilidade e dados, “que horas são?”, “calcule 30% de 200”, “temporizador de 5 minutos”, “anote revisar o balanço”, “mostre a galáxia” ou “voe para Feira de Santana”.</p>
        <h3>Privacidade</h3>
        <p>Em espera, Navegador usa reconhecimento local: o áudio e a transcrição não são enviados a um serviço de voz. Requer suporte local e o pacote de português; sem isso, a escuta fica desligada. Após ativar, só a pergunta autorizada segue para o ÍCARO. Com Servidor, a gravação começa apenas após tocar no microfone e o áudio é enviado para transcrição.</p>
        {children}
      </dialog>
    </>
  );
}
