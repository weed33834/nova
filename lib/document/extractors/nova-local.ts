/**
 * Nova local extractor — parses structured data, web content, code & academic
 * formats entirely in-process (no external API). Covers:
 *   - Structured data: CSV, JSON, YAML, XML
 *   - Web & e-book: HTML, EPUB
 *   - Code & notebook: IPYNB, Python, JS/TS
 *   - Academic: LaTeX, BibTeX, RIS
 *
 * Each format's extracted text is wrapped as a markdown DocumentBlock so it
 * flows into the generation pipeline the same way as PDF text.
 */

import yaml from 'js-yaml';
import JSZip from 'jszip';
import { DOCUMENT_MIME_TYPES } from '../mime';
import type { DocumentExtractorProvider, DocumentArtifact, DocumentBlock } from '../types';

const NOVA_LOCAL_MIME_TYPES = [
  DOCUMENT_MIME_TYPES.csv,
  DOCUMENT_MIME_TYPES.json,
  DOCUMENT_MIME_TYPES.yaml,
  DOCUMENT_MIME_TYPES.xml,
  DOCUMENT_MIME_TYPES.html,
  DOCUMENT_MIME_TYPES.epub,
  DOCUMENT_MIME_TYPES.ipynb,
  DOCUMENT_MIME_TYPES.python,
  DOCUMENT_MIME_TYPES.javascript,
  DOCUMENT_MIME_TYPES.typescript,
  DOCUMENT_MIME_TYPES.latex,
  DOCUMENT_MIME_TYPES.bibtex,
  DOCUMENT_MIME_TYPES.ris,
];

function decode(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function makeArtifact(
  input: { fileName?: string; fileSize?: number; mimeType: string },
  text: string,
  blockType: 'text' | 'markdown' = 'markdown',
): DocumentArtifact {
  return {
    metadata: {
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      providerId: 'nova-local',
    },
    blocks: [{ id: 'text_1', type: blockType, text }],
    assets: [],
    diagnostics: [],
  };
}

// ─── CSV ────────────────────────────────────────────────────────────────────
function parseCSV(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return 'Empty CSV file.';

  // Simple CSV parser: split by comma, handle basic quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  const rows = lines.map(parseLine);
  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Build a markdown table (capped to 100 rows for token budget)
  const displayRows = dataRows.slice(0, 100);
  const truncated = dataRows.length - displayRows.length;

  let md = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n`;
  for (const row of displayRows) {
    md += `| ${row.join(' | ')} |\n`;
  }
  md += `\n*${dataRows.length} data rows total`;
  if (truncated > 0) md += `, showing first ${displayRows.length}`;
  md += `.*\n`;

  // Add basic statistics for numeric columns
  if (dataRows.length > 0) {
    const stats: string[] = [];
    headers.forEach((header, colIdx) => {
      const values = dataRows.map((r) => r[colIdx]).filter(Boolean);
      const nums = values.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
      if (nums.length > 0 && nums.length / values.length > 0.5) {
        const sum = nums.reduce((a, b) => a + b, 0);
        const avg = sum / nums.length;
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        stats.push(
          `- **${header}**: ${nums.length} numeric values, min=${min.toFixed(2)}, max=${max.toFixed(2)}, avg=${avg.toFixed(2)}`,
        );
      }
    });
    if (stats.length > 0) {
      md += `\n### Statistics\n${stats.join('\n')}\n`;
    }
  }

  return md;
}

// ─── JSON ───────────────────────────────────────────────────────────────────
function parseJSON(text: string): string {
  try {
    const data = JSON.parse(text);
    let md = '```json\n';
    md += JSON.stringify(data, null, 2).slice(0, 50000); // Cap to 50k chars
    md += '\n```\n';

    // Add a brief schema summary
    md += '\n### Schema Summary\n';
    function describeSchema(obj: unknown, depth = 0, prefix = '- '): string[] {
      if (depth > 3) return [`${prefix}... (max depth reached)`];
      if (obj === null) return [`${prefix}null`];
      if (Array.isArray(obj)) {
        const lines = [`${prefix}array (${obj.length} items)`];
        if (obj.length > 0) lines.push(...describeSchema(obj[0], depth + 1, '  ' + prefix));
        return lines;
      }
      if (typeof obj === 'object') {
        const entries = Object.entries(obj as Record<string, unknown>);
        const lines = [`${prefix}object (${entries.length} keys)`];
        for (const [key, val] of entries.slice(0, 20)) {
          const type = Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val;
          lines.push(`  - \`${key}\`: ${type}`);
        }
        return lines;
      }
      return [`${prefix}${typeof obj}`];
    }
    md += describeSchema(data).join('\n') + '\n';
    return md;
  } catch {
    return `Invalid JSON:\n\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\``;
  }
}

// ─── YAML ───────────────────────────────────────────────────────────────────
function parseYAML(text: string): string {
  try {
    const data = yaml.load(text);
    let md = '```yaml\n';
    md += yaml.dump(data, { indent: 2 }).slice(0, 50000);
    md += '\n```\n';

    if (data && typeof data === 'object') {
      const keys = Object.keys(data as Record<string, unknown>);
      md += `\n*Top-level keys: ${keys.join(', ')}*\n`;
    }
    return md;
  } catch (e) {
    return `Invalid YAML:\n\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\`\n\nError: ${e}`;
  }
}

// ─── XML ────────────────────────────────────────────────────────────────────
function parseXML(text: string): string {
  // Extract text content from all elements
  const textContent = text
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .replace(/<\?[\s\S]*?\?>/g, '') // Remove declarations
    .replace(/<\/[^>]+>/g, '\n') // Closing tags → newline
    .replace(/<[^>]+>/g, '') // Remove all tags
    .replace(/\n{3,}/g, '\n\n') // Collapse blank lines
    .trim();

  // Build a tag tree summary
  const tagMatches = text.match(/<(\w+)[\s/>]/g) || [];
  const tagCounts: Record<string, number> = {};
  for (const match of tagMatches) {
    const tag = match.replace(/<|[\s/>]/g, '');
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const tagSummary = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => `- \`${tag}\` × ${count}`)
    .join('\n');

  return `### Extracted Text\n\n${textContent.slice(0, 40000)}\n\n### Tag Summary\n\n${tagSummary}\n`;
}

// ─── HTML ───────────────────────────────────────────────────────────────────
function parseHTML(text: string): string {
  // Extract title
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Remove script/style blocks, then tags
  const body = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Convert common block elements to markdown
  let md = body
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (title) md = `# ${title}\n\n${md}`;
  return md.slice(0, 50000);
}

// ─── EPUB ───────────────────────────────────────────────────────────────────
async function parseEPUB(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

  // Find the container.xml to locate the OPF file
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) return 'Invalid EPUB: no container.xml found.';

  const containerXml = await containerFile.async('text');
  const opfPathMatch = containerXml.match(/<rootfile[^>]*full-path="([^"]+)"/i);
  if (!opfPathMatch) return 'Invalid EPUB: no OPF path in container.xml.';

  const opfPath = opfPathMatch[1];
  const opfFile = zip.file(opfPath);
  if (!opfFile) return `Invalid EPUB: OPF file not found at ${opfPath}.`;

  const opfContent = await opfFile.async('text');

  // Extract spine order (reading order)
  const idrefMatches = opfContent.match(/<itemref[^>]*idref="([^"]+)"/gi) || [];
  const spineIds = idrefMatches.map((m) => m.match(/idref="([^"]+)"/i)?.[1]).filter(Boolean);

  // Build manifest map: id → href
  const manifestMatches = opfContent.match(/<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"/gi) || [];
  const manifest: Record<string, string> = {};
  for (const match of manifestMatches) {
    const idMatch = match.match(/id="([^"]+)"/i);
    const hrefMatch = match.match(/href="([^"]+)"/i);
    if (idMatch && hrefMatch) manifest[idMatch[1]] = hrefMatch[1];
  }

  // Extract title from metadata
  const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const bookTitle = titleMatch ? titleMatch[1].trim() : '';

  // Read each chapter in spine order
  const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]+$/, '/') : '';
  let md = '';
  if (bookTitle) md += `# ${bookTitle}\n\n`;

  let chapterCount = 0;
  for (const id of spineIds) {
    if (!id || !manifest[id]) continue;
    const href = manifest[id];
    const fullPath = opfDir + href;
    const chapterFile = zip.file(fullPath) || zip.file(href);
    if (!chapterFile) continue;

    const htmlContent = await chapterFile.async('text');
    const chapterText = parseHTML(htmlContent);
    if (chapterText.trim()) {
      md += `---\n\n${chapterText}\n\n`;
      chapterCount++;
    }

    // Cap total output
    if (md.length > 50000) {
      md += `\n*... truncated (${chapterCount} chapters extracted so far)*\n`;
      break;
    }
  }

  return md || 'Empty EPUB: no readable content found.';
}

// ─── IPYNB (Jupyter Notebook) ────────────────────────────────────────────────
function parseIPYNB(text: string): string {
  try {
    const nb = JSON.parse(text) as {
      cells?: Array<{
        cell_type?: string;
        source?: string | string[];
        outputs?: Array<{
          output_type?: string;
          text?: string | string[];
          data?: Record<string, string | string[]>;
        }>;
      }>;
      metadata?: { kernelspec?: { name?: string; display_name?: string } };
    };

    const kernel = nb.metadata?.kernelspec?.display_name || 'unknown';
    let md = `*Jupyter Notebook (${kernel})*\n\n`;

    for (const cell of nb.cells || []) {
      const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source || '';
      const type = cell.cell_type || 'raw';

      if (type === 'markdown') {
        md += `${source}\n\n`;
      } else if (type === 'code') {
        md += '```python\n' + source + '\n```\n\n';
        // Include text outputs
        for (const output of cell.outputs || []) {
          if (output.output_type === 'stream' && output.text) {
            const outText = Array.isArray(output.text) ? output.text.join('') : output.text;
            md += '```\n' + outText + '\n```\n\n';
          } else if (
            output.output_type === 'execute_result' ||
            output.output_type === 'display_data'
          ) {
            const textData = output.data?.['text/plain'];
            if (textData) {
              const outText = Array.isArray(textData) ? textData.join('') : textData;
              md += '```\n' + outText + '\n```\n\n';
            }
          }
        }
      }
    }

    return md.slice(0, 50000);
  } catch {
    return `Invalid Jupyter notebook JSON:\n\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\``;
  }
}

// ─── Source code (Python/JS/TS) ──────────────────────────────────────────────
function parseSourceCode(text: string, language: string): string {
  const lines = text.split('\n');
  const lineCount = lines.length;

  // Extract function/class/import signatures for a quick summary
  const signatures: string[] = [];
  const patterns: Record<string, RegExp[]> = {
    python: [
      /^\s*def\s+(\w+)\s*\(/gm,
      /^\s*class\s+(\w+)\s*[(:]/gm,
      /^\s*(?:from\s+\S+\s+)?import\s+.+/gm,
    ],
    javascript: [
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm,
      /^\s*(?:export\s+)?class\s+(\w+)\s*[({]/gm,
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/gm,
      /^\s*import\s+.+\s+from\s+.+/gm,
    ],
    typescript: [
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[<(]/gm,
      /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)\s*[<{]/gm,
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]/gm,
      /^\s*import\s+.+\s+from\s+.+/gm,
      /^\s*(?:export\s+)?interface\s+(\w+)\s/gm,
      /^\s*(?:export\s+)?type\s+(\w+)\s*=/gm,
    ],
  };

  const langPatterns = patterns[language] || patterns.javascript;
  for (const pattern of langPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      signatures.push(match[0].trim());
    }
  }

  let md = `*${language} source, ${lineCount} lines*\n\n`;
  if (signatures.length > 0) {
    md += '### Summary\n';
    md += signs(signatures.slice(0, 50));
    md += '\n\n---\n\n';
  }
  md += '```' + language + '\n' + text.slice(0, 40000) + '\n```\n';
  return md;

  function signs(s: string[]): string {
    return s.map((x) => `- \`${x}\``).join('\n') + '\n';
  }
}

// ─── LaTeX ───────────────────────────────────────────────────────────────────
function parseLatex(text: string): string {
  let md = text;

  // Extract title/author from preamble
  const titleMatch = text.match(/\\title\{([^}]*)\}/);
  const authorMatch = text.match(/\\author\{([^}]*)\}/);
  if (titleMatch || authorMatch) {
    md = `# ${titleMatch?.[1] || 'Untitled'}\n`;
    if (authorMatch) md += `*Author: ${authorMatch[1]}*\n\n`;
  }

  // Strip LaTeX commands and environments, keeping content
  const body = text
    .replace(/\\documentclass(\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/\\usepackage(\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .replace(/\\title\{[^}]*\}/g, '')
    .replace(/\\author\{[^}]*\}/g, '')
    .replace(/\\date\{[^}]*\}/g, '')
    .replace(/\\maketitle/g, '')
    .replace(/\\tableofcontents/g, '')
    .replace(/\\begin\{([^}]*)\}/g, '\n') // Environments → newline
    .replace(/\\end\{([^}]*)\}/g, '\n')
    .replace(/\\section\{([^}]*)\}/g, '\n## $1\n')
    .replace(/\\subsection\{([^}]*)\}/g, '\n### $1\n')
    .replace(/\\subsubsection\{([^}]*)\}/g, '\n#### $1\n')
    .replace(/\\textbf\{([^}]*)\}/g, '**$1**')
    .replace(/\\textit\{([^}]*)\}/g, '*$1*')
    .replace(/\\emph\{([^}]*)\}/g, '*$1*')
    .replace(/\\underline\{([^}]*)\}/g, '$1')
    .replace(/\\texttt\{([^}]*)\}/g, '`$1`')
    .replace(/\\item\s+/g, '- ')
    .replace(/\\caption\{([^}]*)\}/g, '*Caption: $1*')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\ref\{[^}]*\}/g, '[ref]')
    .replace(/\\cite\{([^}]*)\}/g, '[cite: $1]')
    .replace(/\\url\{([^}]*)\}/g, '$1')
    .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '[$2]($1)')
    .replace(/\$([^$]*)\$/g, '`$1`') // Inline math
    .replace(/\$\$([^$]*)\$\$/g, '\n```\n$1\n```\n') // Display math
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, '') // Remaining commands
    .replace(/%\s*.*/g, '') // Comments
    .replace(/\{([^{}]*)\}/g, '$1') // Remaining braces
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return md + body.slice(0, 45000);
}

// ─── BibTeX ──────────────────────────────────────────────────────────────────
function parseBibTeX(text: string): string {
  const entries: string[] = [];
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,\s*([\s\S]*?)\n\}/g;
  let match;
  let count = 0;

  while ((match = entryRegex.exec(text)) !== null) {
    const [, type, key, body] = match;
    count++;

    // Parse fields
    const fields: Record<string, string> = {};
    const fieldRegex = /(\w+)\s*=\s*\{([^}]*)\}/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      fields[fieldMatch[1].toLowerCase()] = fieldMatch[2].trim();
    }

    let entry = `### ${type}: ${key}\n`;
    for (const [field, value] of Object.entries(fields)) {
      entry += `- **${field}**: ${value}\n`;
    }
    entries.push(entry);
  }

  if (entries.length === 0)
    return `No valid BibTeX entries found.\n\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\``;
  return (
    `*${count} BibTeX entries*\n\n${entries.slice(0, 100).join('\n')}` +
    (count > 100 ? `\n\n*... and ${count - 100} more entries*` : '')
  );
}

// ─── RIS (Research Information Systems) ──────────────────────────────────────
function parseRIS(text: string): string {
  const entries: string[] = [];
  const records = text.split(/\n\s*ER\s*-?\s*\n/);

  for (const record of records) {
    if (!record.trim()) continue;
    const fields: Record<string, string> = {};
    const lines = record.split('\n');
    let currentTag = '';

    for (const line of lines) {
      const tagMatch = line.match(/^([A-Z0-9]{2})\s*-\s*(.*)$/);
      if (tagMatch) {
        currentTag = tagMatch[1];
        if (currentTag !== 'ER') {
          fields[currentTag] = (fields[currentTag] || '') + tagMatch[2];
        }
      } else if (currentTag && line.trim()) {
        fields[currentTag] += ' ' + line.trim();
      }
    }

    if (Object.keys(fields).length > 0) {
      const type = fields['TY'] || 'Unknown';
      const title = fields['TI'] || fields['T1'] || fields['ST'] || 'Untitled';
      const author = fields['AU'] || fields['A1'] || fields['A2'] || '';
      const year = fields['PY'] || fields['Y1'] || '';
      const journal = fields['JO'] || fields['JF'] || fields['JA'] || '';
      const doi = fields['DO'] || '';

      let entry = `### ${type}: ${title}\n`;
      if (author) entry += `- **Author**: ${author}\n`;
      if (year) entry += `- **Year**: ${year}\n`;
      if (journal) entry += `- **Journal**: ${journal}\n`;
      if (doi) entry += `- **DOI**: ${doi}\n`;
      // Include remaining fields
      for (const [tag, value] of Object.entries(fields)) {
        if (
          ![
            'TY',
            'TI',
            'T1',
            'ST',
            'AU',
            'A1',
            'A2',
            'PY',
            'Y1',
            'JO',
            'JF',
            'JA',
            'DO',
            'ER',
          ].includes(tag)
        ) {
          entry += `- **${tag}**: ${value}\n`;
        }
      }
      entries.push(entry);
    }
  }

  if (entries.length === 0)
    return `No valid RIS entries found.\n\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\``;
  return (
    `*${entries.length} RIS entries*\n\n${entries.slice(0, 100).join('\n')}` +
    (entries.length > 100 ? `\n\n*... and ${entries.length - 100} more entries*` : '')
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────
export const novaLocalExtractorProvider: DocumentExtractorProvider = {
  id: 'nova-local',
  displayName: 'Nova Local Parser',
  supportedMimeTypes: NOVA_LOCAL_MIME_TYPES,
  capabilities: {
    text: true,
    images: false,
    tables: true,
    formulas: false,
    layout: false,
    ocr: false,
    async: false,
  },
  async extract(input): Promise<DocumentArtifact> {
    const { buffer, mimeType, fileName } = input;

    // EPUB is a zip — needs async decompression
    if (mimeType === DOCUMENT_MIME_TYPES.epub) {
      const text = await parseEPUB(buffer);
      return makeArtifact(input, text);
    }

    const text = decode(buffer);
    let result = '';

    switch (mimeType) {
      case DOCUMENT_MIME_TYPES.csv:
        result = parseCSV(text);
        break;
      case DOCUMENT_MIME_TYPES.json:
        result = parseJSON(text);
        break;
      case DOCUMENT_MIME_TYPES.yaml:
        result = parseYAML(text);
        break;
      case DOCUMENT_MIME_TYPES.xml:
        result = parseXML(text);
        break;
      case DOCUMENT_MIME_TYPES.html:
        result = parseHTML(text);
        break;
      case DOCUMENT_MIME_TYPES.ipynb:
        result = parseIPYNB(text);
        break;
      case DOCUMENT_MIME_TYPES.python:
        result = parseSourceCode(text, 'python');
        break;
      case DOCUMENT_MIME_TYPES.javascript:
        result = parseSourceCode(text, 'javascript');
        break;
      case DOCUMENT_MIME_TYPES.typescript:
        result = parseSourceCode(text, 'typescript');
        break;
      case DOCUMENT_MIME_TYPES.latex:
        result = parseLatex(text);
        break;
      case DOCUMENT_MIME_TYPES.bibtex:
        result = parseBibTeX(text);
        break;
      case DOCUMENT_MIME_TYPES.ris:
        result = parseRIS(text);
        break;
      default:
        // Fallback: treat as plain text with a code fence
        result = '```\n' + text.slice(0, 40000) + '\n```\n';
    }

    return makeArtifact(input, result);
  },
};

// Helper: extract blocks (unused but available for richer block segmentation)
export function extractBlocks(mimeType: string, text: string): DocumentBlock[] {
  return [{ id: 'text_1', type: 'markdown', text }];
}
