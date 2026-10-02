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
        <h3>Como usar</h3>
        <p>Diga “Ok, Ícaro” ou “Let’s go, Ícaro”, seguido da pergunta, ou pressione Enter / seta direita (avançar slide). “Stop, Ícaro” interrompe.</p>
        <p>Cada ativação autoriza uma pergunta; sem pergunta em 10 segundos, expira em silêncio.</p>
        <h3>Privacidade</h3>
        <p>Em espera, Navegador usa reconhecimento local: o áudio e a transcrição não são enviados a um serviço de voz. Requer suporte local e o pacote de português; sem isso, a escuta fica desligada. Após ativar, só a pergunta autorizada segue para o ÍCARO. Com Servidor, a gravação começa apenas após tocar no microfone e o áudio é enviado para transcrição.</p>
        {children}
      </dialog>
    </>
  );
}
