import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  Minus,
  Move,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import type { AvatarLayout, AvatarLayoutAction } from '@/lib/avatar-layout';

interface AvatarAdjusterProps {
  layout: AvatarLayout;
  open: boolean;
  saveError: string;
  onOpenChange: (open: boolean) => void;
  onAction: (action: AvatarLayoutAction) => void;
}

export function AvatarAdjuster({
  layout,
  open,
  saveError,
  onOpenChange,
  onAction,
}: AvatarAdjusterProps) {
  return (
    <>
      <button
        type="button"
        className="avatar-adjuster-trigger hbtn"
        onClick={() => onOpenChange(!open)}
        aria-label={open ? 'Fechar ajustes do Ícaro' : 'Abrir ajustes do Ícaro'}
        aria-expanded={open}
        aria-controls="icaro-avatar-adjuster"
        title="Ajustar posição e tamanho do Ícaro"
        data-testid="button-avatar-adjuster"
      >
        <Move size={15} />
        <span>Ajustar ÍCARO</span>
      </button>

      <aside
        id="icaro-avatar-adjuster"
        className="avatar-adjuster"
        aria-label="Ajustes do rosto do Ícaro"
        hidden={!open}
        data-testid="panel-avatar-adjuster"
      >
        <div className="avatar-adjuster__header">
          <strong className="disp">Posição do ÍCARO</strong>
          <button
            type="button"
            className="avatar-adjuster__close"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar ajustes do Ícaro"
            data-testid="button-avatar-adjuster-close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="avatar-adjuster__pad" role="group" aria-label="Mover o rosto do Ícaro">
          <button type="button" className="avatar-adjuster__direction avatar-adjuster__up" onClick={() => onAction('move-up')} aria-label="Mover Ícaro para cima" title="Mover para cima" data-testid="button-avatar-up"><ArrowUp size={17} /></button>
          <button type="button" className="avatar-adjuster__direction avatar-adjuster__left" onClick={() => onAction('move-left')} aria-label="Mover Ícaro para a esquerda" title="Mover para a esquerda" data-testid="button-avatar-left"><ArrowLeft size={17} /></button>
          <button type="button" className="avatar-adjuster__direction avatar-adjuster__reset" onClick={() => onAction('reset')} aria-label="Centralizar e restaurar o tamanho do Ícaro" title="Centralizar e restaurar tamanho" data-testid="button-avatar-reset"><RotateCcw size={15} /></button>
          <button type="button" className="avatar-adjuster__direction avatar-adjuster__right" onClick={() => onAction('move-right')} aria-label="Mover Ícaro para a direita" title="Mover para a direita" data-testid="button-avatar-right"><ArrowRight size={17} /></button>
          <button type="button" className="avatar-adjuster__direction avatar-adjuster__down" onClick={() => onAction('move-down')} aria-label="Mover Ícaro para baixo" title="Mover para baixo" data-testid="button-avatar-down"><ArrowDown size={17} /></button>
        </div>

        <div className="avatar-adjuster__size" role="group" aria-label="Tamanho do rosto do Ícaro">
          <button type="button" className="avatar-adjuster__size-button" onClick={() => onAction('smaller')} disabled={layout.scale <= 0.4} aria-label="Diminuir tamanho do Ícaro" title="Diminuir" data-testid="button-avatar-smaller"><Minus size={16} /></button>
          <span aria-live="polite">Tamanho <strong>{Math.round(layout.scale * 100)}%</strong></span>
          <button type="button" className="avatar-adjuster__size-button" onClick={() => onAction('larger')} disabled={layout.scale >= 1.2} aria-label="Aumentar tamanho do Ícaro" title="Aumentar" data-testid="button-avatar-larger"><Plus size={16} /></button>
        </div>

        <button
          type="button"
          className="avatar-adjuster__visibility"
          onClick={() => onAction('toggle-visibility')}
          aria-pressed={layout.hidden}
          aria-label={layout.hidden ? 'Mostrar Ícaro' : 'Ocultar Ícaro'}
          data-testid="button-avatar-visibility"
        >
          {layout.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          {layout.hidden ? 'Mostrar ÍCARO' : 'Ocultar ÍCARO'}
        </button>

        <p className="avatar-adjuster__note">
          {saveError || 'Ajustes salvos neste dispositivo.'}
        </p>
      </aside>
    </>
  );
}