# Documentação técnica do Ícaro

Documentação de referência do produto inteiro, escrita em português para
desenvolvimento, manutenção e estudo de **Análise e Desenvolvimento de
Sistemas (ADS)**.

## Comece por aqui

1. [Arquitetura, cascata e cronologia](ARQUITETURA-ADS.md) — como as partes se
   conectam e em que ordem os dados percorrem o sistema.
2. [Referência da API](API-REFERENCE.md) — rotas implementadas, autenticação,
   parâmetros, respostas, falhas e eventos de streaming.
3. [Mapa do código](MAPA-DO-CODIGO.md) — responsabilidades dos pacotes, páginas,
   serviços e principais intervalos de linhas.

## Fonte de verdade e limites

- O comportamento descrito como **implementado** foi conferido nos arquivos
  atuais do projeto.
- A API real é Express. `lib/api-spec/openapi.yaml` é um contrato útil, mas não
  descreve sozinho todas as rotas nem toda a política de autenticação; a
  referência da API registra essas diferenças.
- A documentação não substitui os tipos, schemas Zod, testes ou comentários do
  código. Quando houver divergência, o comportamento executado e validado deve
  ser confirmado no servidor e nos schemas correspondentes.
- O projeto contém mais de 30 mil linhas entre frontend, servidor e bibliotecas,
  além de conteúdo de conhecimento, declarações geradas e código vendorizado.
  Por isso, o mapa explica todos os domínios e arquivos de entrada por
  responsabilidade e dá leitura detalhada por blocos nos módulos centrais; não
  duplica milhares de linhas nem atribui uma paráfrase artificial a cada
  pontuação ou linha em branco.
- Os números de linha são uma referência do estado documentado. Atualize-os
  quando o código mudar. Para obter a numeração corrente:

  ```bash
  nl -ba caminho/do/arquivo.ts
  ```

## Atualização

Ao adicionar ou alterar uma rota:

1. atualize `lib/api-spec/openapi.yaml` e os schemas compartilhados aplicáveis;
2. atualize [API-REFERENCE.md](API-REFERENCE.md), incluindo acesso,
   validação, resposta e erros observados;
3. atualize [ARQUITETURA-ADS.md](ARQUITETURA-ADS.md) se a cascata ou cronologia
   mudou;
4. atualize [MAPA-DO-CODIGO.md](MAPA-DO-CODIGO.md) quando arquivos,
   responsabilidades ou intervalos centrais mudarem;
5. execute typecheck e os validadores associados à funcionalidade alterada.
