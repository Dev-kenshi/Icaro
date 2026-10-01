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
    case 'service-not-allowed': return 'O navegador bloqueou o serviço de reconhecimento de voz. Experimente Chrome ou Edge e, nesta visualização, abra uma nova aba.';
    case 'network': return 'O serviço de reconhecimento do navegador está sem conexão. A ativação por voz depende desse serviço, não da Groq.';
    case 'language-not-supported': return 'Este navegador não oferece reconhecimento em português. Experimente Chrome ou Edge.';
    case 'unsupported': return 'Este navegador não oferece reconhecimento de voz. Use Chrome ou Edge, ou digite sua pergunta.';
    default: return 'Não foi possível iniciar o reconhecimento. Confira o microfone e tente retomar a escuta.';
  }
}