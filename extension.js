const vscode = require('vscode');

/**
 * Extrai o nome da variável MKQ sob o cursor.
 * Suporta tanto [NOME] quanto [$NOME$].
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {string|null}
 */
function getVariableNameAtPosition(document, position) {
  const line = document.lineAt(position).text;
  const offset = position.character;

  // Busca todos os padrões [... ] e [$...$] na linha
  const pattern = /\[\$?([^\]\$]+)\$?\]/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    if (offset >= start && offset <= end) {
      return match[1]; // nome sem colchetes/cifrões
    }
  }
  return null;
}

/**
 * Retorna o intervalo de linhas [start, end) do bloco << >> que contém a linha dada.
 * Um bloco começa com uma linha que contém << (abertura) e termina com >>.
 * @param {vscode.TextDocument} document
 * @param {number} lineIndex
 * @returns {{ start: number, end: number }}
 */
function getBlockRange(document, lineIndex) {
  const blockStart = /^<<[^>]/;   // linha que abre bloco: <<NOME
  const blockEnd   = /^\s*>>/;    // linha que fecha bloco: >>

  // Procura o << que antecede a linha atual
  let start = 0;
  for (let i = lineIndex; i >= 0; i--) {
    if (blockStart.test(document.lineAt(i).text)) {
      start = i;
      break;
    }
    // Se encontrarmos um >> antes de qualquer <<, o cursor está fora de bloco nomeado
    if (i < lineIndex && blockEnd.test(document.lineAt(i).text)) {
      start = 0;
      break;
    }
  }

  // Procura o >> que fecha o bloco
  let end = document.lineCount;
  for (let i = lineIndex; i < document.lineCount; i++) {
    if (blockEnd.test(document.lineAt(i).text)) {
      end = i + 1;
      break;
    }
  }

  return { start, end };
}

/**
 * Procura a declaração de uma variável dentro do mesmo bloco << >> que a posição do cursor.
 * A declaração tem o formato:  [NOME] : ... (linha começando com [NOME] seguido de :)
 * @param {vscode.TextDocument} document
 * @param {string} varName
 * @param {number} cursorLine
 * @returns {vscode.Location|null}
 */
function findDeclaration(document, varName, cursorLine) {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declPattern = new RegExp(`^\\s*\\[${escaped}\\]\\s*:`);

  const { start, end } = getBlockRange(document, cursorLine);

  for (let i = start; i < end; i++) {
    const text = document.lineAt(i).text;
    if (declPattern.test(text)) {
      const col = text.indexOf(`[${varName}]`);
      const pos = new vscode.Position(i, col >= 0 ? col : 0);
      return new vscode.Location(document.uri, pos);
    }
  }
  return null;
}

const TAG_DOCS = {
  PAR: '**[PAR]** — Parâmetros\n\nDefine as variáveis/parâmetros de entrada da tela. Cada linha tem o formato:\n`[NOME] : Label : Tipo : Query ; Colunas ; Retorno`',
  TIT: '**[TIT]** — Título\n\nDefine o título exibido na janela ou painel.',
  SQL: '**[SQL]** — Query principal\n\nInstrução SQL (SELECT) que alimenta a grade de dados exibida na tela.',
  SQE: '**[SQE]** — Query de edição\n\nSQL alternativo usado quando a grade está em modo de edição.',
  PLI: '**[PLI]** — PL/SQL de inicialização\n\nBloco PL/SQL executado **antes** de exibir a tela (na abertura).',
  PLF: '**[PLF]** — PL/SQL de finalização\n\nBloco PL/SQL executado **após** o usuário confirmar uma opção (`[OPC]`).',
  PLE: '**[PLE]** — Chave primária\n\nIndica a coluna chave da grade. Formato: `COLUNA#0`.',
  OPC: '**[OPC]** — Opções de ação\n\nLista de botões/ações disponíveis para o usuário. Formato:\n`+> NOME: %ICONE : Label : Comportamento : exists (...)`',
  OPP: '**[OPP]** — Opções de ação (pop-up)\n\nIgual ao `[OPC]`, porém exibido como menu de contexto.',
  DIM: '**[DIM]** — Dimensões\n\nDefine largura e altura da janela. Formato: `largura:altura`.',
  MII: '**[MII]** — Mensagem de confirmação (inicialização)\n\nTexto exibido para confirmar a execução do `[PLI]`.',
  MIF: '**[MIF]** — Mensagem de feedback (inicialização)\n\nTexto exibido **após** a execução bem-sucedida do `[PLI]`.',
  MFI: '**[MFI]** — Mensagem de confirmação (finalização)\n\nTexto exibido para confirmar a execução do `[PLF]`.',
  MFF: '**[MFF]** — Mensagem de feedback (finalização)\n\nTexto exibido **após** a execução bem-sucedida do `[PLF]`.',
  MSI: '**[MSI]** — Mensagem de confirmação (seleção)\n\nTexto exibido para confirmar ação sobre item selecionado na grade.',
  MSF: '**[MSF]** — Mensagem de feedback (seleção)\n\nTexto exibido após ação sobre item selecionado na grade.',
  EDT: '**[EDT]** — Colunas editáveis\n\nDefine quais colunas da grade podem ser editadas pelo usuário.\nFormato: `índice : Tipo : Intervalo : Tabela : Campo : Label : Alinhamento`',
  VDD: '**[VDD]** — Validação de dados\n\nRegras de validação para os campos editáveis (`[EDT]`).',
  GRD: '**[GRD]** — Grade auxiliar\n\nDefine uma grade secundária vinculada à grade principal.',
  CAB: '**[CAB]** — Cabeçalho\n\nTexto ou SQL exibido no cabeçalho da tela.',
  COR: '**[COR]** — Cores condicionais\n\nRegras para colorir linhas ou células da grade conforme condição.',
  DEF: '**[DEF]** — Valores padrão\n\nDefine valores default para parâmetros do `[PAR]`.',
  FOG: '**[FOG]** — Fórmula de ordenação/grouping\n\nAgrupa ou ordena linhas da grade.',
  PRE: '**[PRE]** — Pré-processamento\n\nSQL ou PL/SQL executado antes do carregamento da tela.',
  MKQ: '**MKQ** — Tipo de arquivo MKQ\n\nExtensão padrão para telas do sistema.',
  PAP: '**[PAP]** — Parâmetros de popup\n\nParâmetros passados para telas abertas como popup.',
  ETQ: '**[ETQ]** — Etiqueta\n\nDefine layout de etiqueta de impressão.',
  QTD: '**[QTD]** — Quantidade\n\nIndica quantidade de cópias ou registros.',
  MRG: '**[MRG]** — Margem\n\nConfigura margens para impressão.',
  LEI: '**[LEI]** — Layout de impressão\n\nDefine o layout geral de impressão da tela.',
  OUT: '**[OUT]** — Saída\n\nConfigura o destino de saída (impressora, arquivo, etc.).',
  PDF: '**[PDF]** — Exportar PDF\n\nConfigura exportação para PDF.',
  CAR: '**[CAR]** — Carregamento\n\nBloco executado no carregamento inicial de dados.',
};

/**
 * Retorna o nome de uma tag MKQ sob o cursor (ex: PAR, SQL, PLI...).
 * Reconhece tanto [TAG] quanto o texto isolado `TAG` em contexto de tag.
 */
function getTagAtPosition(document, position) {
  const line = document.lineAt(position).text;
  const offset = position.character;

  // Tenta match de [TAG] ou [TAG]
  const bracketPattern = /\[([A-Z_]{2,10})\]/g;
  let m;
  while ((m = bracketPattern.exec(line)) !== null) {
    if (offset >= m.index && offset <= m.index + m[0].length) {
      return m[1];
    }
  }
  return null;
}

/**
 * Dado uma linha #CLI/[pasta/]arquivo\x04[VAR]\x04BLOCKNAME\x04...
 * ou             #CLI/[pasta/]arquivo[param][param]...
 * retorna { fileName, blockName } — blockName pode ser null quando não há separador EOT.
 */
function parseCliLine(text) {
  const cliMatch = /^\s*#[Cc][Ll][Ii]\/([^\x04\s]+)/i.exec(text);
  if (!cliMatch) return null;
  const fileName = cliMatch[1];
  const parts = text.split('\x04');
  // Se houver EOT, procura parte que seja só maiúsculas/underscore/números (nome do bloco)
  if (parts.length > 1) {
    const blockName = parts.find((p, i) => i > 0 && /^[A-Z_][A-Z_0-9]*$/.test(p.trim()));
    return { fileName, blockName: blockName ? blockName.trim() : null };
  }
  // Sem EOT: sem nome de bloco — vai para o início do arquivo
  return { fileName, blockName: null };
}

/**
 * Procura no workspace um arquivo cujo nome (sem extensão) seja fileName,
 * e dentro dele a linha que declara o bloco: <<NOME ou ##> '[$DRILL$]' = 'BLOCKNAME'
 * @param {string} fileName
 * @param {string} blockName
 * @returns {Promise<vscode.Location|null>}
 */
async function findBlockDefinition(fileName, blockName) {
  const escapedFile = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const files = await vscode.workspace.findFiles(
    `**/${escapedFile}.{mkq,etq,myo}`,
    '**/node_modules/**'
  );

  for (const fileUri of files) {
    // Sem nome de bloco: abre o arquivo no início
    if (!blockName) {
      return new vscode.Location(fileUri, new vscode.Position(0, 0));
    }

    const drillPattern = new RegExp(`##>\\s*'\\[\\$DRILL\\$\\]'\\s*=\\s*'${blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
    const doc = await vscode.workspace.openTextDocument(fileUri);

    for (let i = 0; i < doc.lineCount; i++) {
      if (drillPattern.test(doc.lineAt(i).text)) {
        return new vscode.Location(fileUri, new vscode.Position(i, 0));
      }
    }
    // Fallback: linha <<BLOCKNAME
    for (let i = 0; i < doc.lineCount; i++) {
      if (new RegExp(`^\\s*<<${blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(doc.lineAt(i).text)) {
        return new vscode.Location(fileUri, new vscode.Position(i, 0));
      }
    }
  }
  return null;
}

class MkqDefinitionProvider {
  async provideDefinition(document, position, _token) {
    const line = document.lineAt(position).text;

    // Caso @>MKQ: pega a linha seguinte que deve ser o #CLI/...
    if (/^\s*@>MKQ\s*$/i.test(line)) {
      const nextLine = position.line + 1 < document.lineCount
        ? document.lineAt(position.line + 1).text
        : '';
      const parsed = parseCliLine(nextLine);
      if (parsed) return findBlockDefinition(parsed.fileName, parsed.blockName);
      return null;
    }

    // Caso #CLI/...: navega direto para o bloco
    if (/^\s*#[Cc][Ll][Ii]\//.test(line)) {
      const parsed = parseCliLine(line);
      if (parsed) return findBlockDefinition(parsed.fileName, parsed.blockName);
      return null;
    }

    // Comportamento original: ir para declaração de variável no [PAR]
    const varName = getVariableNameAtPosition(document, position);
    if (!varName) return null;
    return findDeclaration(document, varName, position.line);
  }
}

// Extrai o valor de drill de ##> '[$DRILL$]' = 'VALOR' <##
const DRILL_COND = /##>\s*'\[\$DRILL\$\]'\s*=\s*'([^']+)'/;

/**
 * Dado um bloco (linha de abertura <<NOME), varre as próximas linhas até
 * encontrar ##> '[$DRILL$]' = 'IDENTIFIER' <## e retorna o identifier.
 * Caso não encontre, retorna o próprio nome do bloco.
 * @param {vscode.TextDocument} document
 * @param {number} openLine  linha do <<NOME
 * @returns {string}
 */
function getDrillIdentifier(document, openLine) {
  for (let i = openLine + 1; i < Math.min(openLine + 10, document.lineCount); i++) {
    const m = DRILL_COND.exec(document.lineAt(i).text);
    if (m) return m[1];
    // Para de procurar se já passou de uma tag de seção
    if (/^\s*\[[A-Z]{2,10}\]\s*$/.test(document.lineAt(i).text)) break;
  }
  // fallback: nome do bloco
  const openMatch = /^\s*<<([^\s>]+)/.exec(document.lineAt(openLine).text);
  return openMatch ? openMatch[1].trim() : '';
}

/**
 * Extrai o identificador do bloco sob o cursor para busca de referências.
 * Reconhece:
 *   - linha de abertura:       <<NOME  → lê ##> para obter o drill identifier
 *   - linha ##> '[$DRILL$]':   extrai o valor direto
 *   - linha de chamada:        #CLI/arquivo[PARAM]NOME[$...]... → NOME sob o cursor
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {string|null}
 */
function getBlockNameAtPosition(document, position) {
  const line = document.lineAt(position).text;
  const offset = position.character;

  // Caso 1: linha de abertura de bloco <<NOME
  if (/^\s*<<[^>]/.test(line)) {
    return getDrillIdentifier(document, position.line);
  }

  // Caso 2: linha ##> '[$DRILL$]' = 'NOME' <##
  const drillMatch = DRILL_COND.exec(line);
  if (drillMatch) return drillMatch[1];

  // Caso 3: linha de chamada separada por EOT (U+0004)
  // Formato: #CLI/arquivo\x04[VARIAVEL]\x04BLOCKNAME\x04[$PARAM$]\x04[PLE]
  // O nome do bloco é a parte entre dois EOT que é apenas letras maiúsculas/underscore/números.
  if (/^\s*#CLI\//.test(line)) {
    const EOT = '\x04';
    const parts = line.split(EOT);
    // Acumula posição de cada parte para verificar onde está o cursor
    let pos = 0;
    for (let pi = 0; pi < parts.length; pi++) {
      const partStart = pos;
      const partEnd   = pos + parts[pi].length;
      if (pi > 0 && /^[A-Z_][A-Z_0-9]*$/.test(parts[pi].trim())) {
        if (offset >= partStart && offset <= partEnd) {
          return parts[pi].trim();
        }
      }
      pos = partEnd + 1; // +1 pelo EOT separador
    }
    // Cursor na linha mas não sobre um nome — devolve o 1º nome de bloco encontrado
    const firstBlock = parts.find((p, i) => i > 0 && /^[A-Z_][A-Z_0-9]*$/.test(p.trim()));
    if (firstBlock) return firstBlock.trim();
  }

  return null;
}

/**
 * Busca todas as referências (chamadas #CLI/...) ao drill identifier no workspace.
 * Uma chamada tem o formato: #CLI/arquivo[PARAM]IDENTIFIER[$...]
 * @param {string} identifier
 * @returns {Promise<vscode.Location[]>}
 */
async function findBlockReferences(identifier, document) {
  const locations = [];

  // Nome do arquivo sem extensão (ex: "manutencao_carga")
  const fileName = document.uri.path.split('/').pop().replace(/\.[^.]+$/, '');

  const escapedId   = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedFile = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Linha deve começar com #CLI/FILENAME e conter \x04IDENTIFIER\x04 ou \x04IDENTIFIER no fim
  const refPattern = new RegExp(
    '^\\s*#CLI\\/' + escapedFile + '.*\x04' + escapedId + '(?:\x04|$)'
  );

  const files = await vscode.workspace.findFiles('**/*.{mkq,etq,myo}', '**/node_modules/**');

  for (const fileUri of files) {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    for (let i = 0; i < doc.lineCount; i++) {
      const text = doc.lineAt(i).text;
      if (!refPattern.test(text)) continue;
      // Posição: logo após o \x04 antes do identifier
      const eotIdx = text.lastIndexOf('\x04' + identifier);
      const col = eotIdx >= 0 ? eotIdx + 1 : 0;
      locations.push(new vscode.Location(fileUri, new vscode.Position(i, col)));
    }
  }

  return locations;
}

class MkqReferenceProvider {
  async provideReferences(document, position, _ctx, _token) {
    const blockName = getBlockNameAtPosition(document, position);
    if (!blockName) return null;
    return findBlockReferences(blockName, document);
  }
}

class MkqHoverProvider {
  provideHover(document, position, _token) {
    const tag = getTagAtPosition(document, position);
    if (!tag || !TAG_DOCS[tag]) return null;
    const md = new vscode.MarkdownString(TAG_DOCS[tag]);
    md.isTrusted = true;
    return new vscode.Hover(md);
  }
}

// Padrão para abertura de bloco: <<NOME (opcionalmente com espaços antes)
const BLOCK_OPEN  = /^\s*<<([^\s>][^\n]*?)\s*$/;
// Padrão para fechamento de bloco: >> (linha com apenas >>)
const BLOCK_CLOSE = /^\s*>>\s*$/;
// Tags de seção dentro de um bloco
const SECTION_TAG = /^\s*\[(PAR|TIT|SQL|SQE|PLI|PLF|PLE|OPC|OPP|DIM|MII|MIF|MFI|MFF|MSI|MSF|EDT|VDD|GRD|CAB|COR|DEF|FOG|PRE|CAR)\]\s*$/;

class MkqDocumentSymbolProvider {
  provideDocumentSymbols(document, _token) {
    const symbols = [];

    let blockSymbol = null;
    let blockStartLine = 0;

    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;

      // Abertura de bloco <<NOME
      const openMatch = BLOCK_OPEN.exec(lineText);
      if (openMatch) {
        blockStartLine = i;
        const name = openMatch[1].trim();
        const range = new vscode.Range(i, 0, i, lineText.length);
        blockSymbol = new vscode.DocumentSymbol(
          name,
          '',
          vscode.SymbolKind.Function,
          range,
          range
        );
        continue;
      }

      // Tags de seção dentro do bloco (filhas)
      if (blockSymbol) {
        const tagMatch = SECTION_TAG.exec(lineText);
        if (tagMatch) {
          const tag = tagMatch[1];
          const tagRange = new vscode.Range(i, 0, i, lineText.length);
          const tagSymbol = new vscode.DocumentSymbol(
            `[${tag}]`,
            TAG_DOCS[tag] ? TAG_DOCS[tag].split('\n')[0].replace(/\*\*/g, '') : '',
            vscode.SymbolKind.Property,
            tagRange,
            tagRange
          );
          blockSymbol.children.push(tagSymbol);
          continue;
        }
      }

      // Fechamento de bloco >>
      if (BLOCK_CLOSE.test(lineText) && blockSymbol) {
        // Expande o range do bloco até a linha de fechamento
        const fullRange = new vscode.Range(blockStartLine, 0, i, lineText.length);
        blockSymbol.range = fullRange;
        symbols.push(blockSymbol);
        blockSymbol = null;
      }
    }

    // Bloco sem fechamento (fim de arquivo)
    if (blockSymbol) {
      const lastLine = document.lineCount - 1;
      blockSymbol.range = new vscode.Range(blockStartLine, 0, lastLine, document.lineAt(lastLine).text.length);
      symbols.push(blockSymbol);
    }

    return symbols;
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const selector = [
    { language: 'mkq' },
    { language: 'etq' },
    { language: 'myo' }
  ];

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, new MkqDefinitionProvider()),
    vscode.languages.registerHoverProvider(selector, new MkqHoverProvider()),
    vscode.languages.registerDocumentSymbolProvider(selector, new MkqDocumentSymbolProvider()),
    vscode.languages.registerReferenceProvider(selector, new MkqReferenceProvider())
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
