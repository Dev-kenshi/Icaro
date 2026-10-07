type Policy = { allowsFeature: (name: string) => boolean };

export function wakeAccessBlockReason(
  document: { permissionsPolicy?: Policy; featurePolicy?: Policy },
  secureContext = true,
): string | null {
  if (!secureContext) return 'insecure-context';
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  try {
    if (policy && !policy.allowsFeature('microphone')) return 'iframe-policy';
  } catch { /* Let the browser's recognition error decide if policy is unavailable. */ }
  return null;
}

export function wakeAccessErrorMessage(error: string | null): string {
  switch (error) {
    case 'iframe-policy': return 'Esta visualização não permite usar o microfone. Abra o Ícaro em uma nova aba para permitir o acesso.';
    case 'insecure-context': return 'O microfone exige uma página segura (HTTPS). Abra a versão segura do Ícaro.';
    case 'not-allowed': return 'O navegador bloqueou o microfone. Permita o acesso nas configurações deste site e clique em Retomar microfone.';
    case 'audio-capture': return 'Nenhum microfone disponível. Confira o dispositivo de entrada e se outro aplicativo está usando o microfone.';
    case 'aborted': return 'O navegador encerrou a escuta de voz sem transcrever. O Ícaro vai tentar novamente; se continuar, abra-o em uma aba própria ou use o modo Servidor (Whisper).';
    case 'service-not-allowed': return 'O navegador bloqueou o reconhecimento local. Experimente Chrome ou Edge e, nesta visualização, abra uma nova aba.';
    case 'network': return 'O reconhecimento local falhou. O Ícaro não vai ativar reconhecimento online em espera; tente retomar ou use a ativação manual.';
    case 'start-failed': return 'A escuta falhou ao reiniciar e está tentando novamente automaticamente. Se continuar, abra o Ícaro em uma nova aba.';
    case 'language-not-supported': return 'Este navegador não oferece reconhecimento local em português. Experimente Chrome ou Edge.';
    case 'unsupported': return 'Este navegador não oferece reconhecimento de voz. Use Chrome ou Edge, ou digite sua pergunta.';
    case 'local-unsupported': return 'Este navegador não oferece reconhecimento local. O áudio não será enviado a um serviço online; use Enter, a seta direita ou ative o modo Servidor manualmente.';
    case 'local-unavailable': return 'Este navegador não tem reconhecimento local de português disponível. A escuta permanece desligada; use Enter, a seta direita ou digite sua pergunta.';
    case 'local-pack-required': return 'O reconhecimento local precisa do pacote de português do navegador. Instale-o para ativar a escuta; o áudio não será enviado a um serviço online.';
    case 'local-pack-install-failed': return 'Não foi possível instalar o pacote local de português. A escuta online não será ativada; tente novamente ou use Enter, a seta direita ou a digitação.';
    case 'local-policy': return 'Esta visualização bloqueou o reconhecimento local. Abra o Ícaro em uma nova aba para tentar novamente.';
    case 'local-check-failed': return 'Não foi possível confirmar o reconhecimento local. O microfone ficará desligado até a verificação funcionar.';
    default: return 'Não foi possível iniciar o reconhecimento. Confira o microfone e tente retomar a escuta.';
  }
}