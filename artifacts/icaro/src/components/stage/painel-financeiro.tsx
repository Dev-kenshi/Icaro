import { X } from 'lucide-react';
import type { PainelFinanceiro as Painel } from '@/lib/ai-chat-stream';

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Painel holográfico com o lançamento ou a composição de custo calculada pelo servidor. */
export function PainelFinanceiro({ painel, onClose }: { painel: Painel; onClose: () => void }) {
  const temCredito = painel.totais.credito > 0;
  const maior = Math.max(...painel.linhas.map((linha) => Math.max(linha.debito, linha.credito)), 1);
  return (
    <section className="painel-fin" aria-label={painel.titulo} data-testid="panel-financeiro">
      <header className="painel-fin__head">
        <span className="disp">{painel.titulo}</span>
        <button className="painel-fin__close" onClick={onClose} aria-label="Fechar painel" data-testid="button-close-panel"><X size={14} /></button>
      </header>
      <table className="painel-fin__table mono">
        <thead>
          <tr><th>Conta</th><th>{temCredito ? 'Débito' : 'Valor'}</th>{temCredito && <th>Crédito</th>}</tr>
        </thead>
        <tbody>
          {painel.linhas.map((linha, index) => (
            <tr key={linha.conta} style={{ animationDelay: `${index * 0.35}s` }}>
              <td>
                {linha.conta}
                <span className={`painel-fin__bar ${linha.credito ? 'is-credit' : ''}`} style={{ width: `${(Math.max(linha.debito, linha.credito) / maior) * 100}%` }} />
              </td>
              <td>{linha.debito ? brl(linha.debito) : ''}</td>
              {temCredito && <td>{linha.credito ? brl(linha.credito) : ''}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Total</td><td>{brl(painel.totais.debito)}</td>{temCredito && <td>{brl(painel.totais.credito)}</td>}</tr>
        </tfoot>
      </table>
      {painel.destaque && (
        <div className="painel-fin__kpi">
          <span>{painel.destaque.rotulo}</span>
          <strong className="disp">{brl(painel.destaque.valor)}</strong>
        </div>
      )}
    </section>
  );
}
