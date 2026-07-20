import { describe, it, expect } from 'vitest';
import { novaLocalExtractorProvider } from '@/lib/document/extractors/nova-local';

describe('novaLocalExtractorProvider', () => {
  it('parses CSV with statistics', async () => {
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from('name,score,grade\nAlice,95,A\nBob,82,B\n'),
      mimeType: 'text/csv',
      fileName: 'grades.csv',
      config: { providerId: 'nova-local' },
    });
    expect(result.metadata.providerId).toBe('nova-local');
    expect(result.blocks[0].text).toContain('| name | score | grade |');
    expect(result.blocks[0].text).toContain('Alice');
    expect(result.blocks[0].text).toContain('Statistics');
  });

  it('parses JSON with schema summary', async () => {
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from(JSON.stringify({ name: 'test', items: [1, 2, 3] })),
      mimeType: 'application/json',
      fileName: 'data.json',
      config: { providerId: 'nova-local' },
    });
    expect(result.blocks[0].text).toContain('```json');
    expect(result.blocks[0].text).toContain('Schema Summary');
  });

  it('parses BibTeX entries', async () => {
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from(
        '@article{smith2024,\n  title={Deep Learning},\n  author={Smith, John},\n  year={2024},\n  journal={Nature}\n}',
      ),
      mimeType: 'application/x-bibtex',
      fileName: 'refs.bib',
      config: { providerId: 'nova-local' },
    });
    expect(result.blocks[0].text).toContain('smith2024');
    expect(result.blocks[0].text).toContain('Deep Learning');
    expect(result.blocks[0].text).toContain('Smith, John');
  });

  it('parses LaTeX with sections', async () => {
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from(
        '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nHello \\textbf{world}.\n\\end{document}',
      ),
      mimeType: 'application/x-latex',
      fileName: 'paper.tex',
      config: { providerId: 'nova-local' },
    });
    expect(result.blocks[0].text).toContain('## Intro');
    expect(result.blocks[0].text).toContain('**world**');
  });

  it('parses IPYNB notebook', async () => {
    const nb = JSON.stringify({
      cells: [
        { cell_type: 'markdown', source: ['# Title'] },
        {
          cell_type: 'code',
          source: 'print("hello")',
          outputs: [{ output_type: 'stream', text: 'hello\n' }],
        },
      ],
      metadata: { kernelspec: { display_name: 'Python 3' } },
    });
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from(nb),
      mimeType: 'application/x-ipynb+json',
      fileName: 'notebook.ipynb',
      config: { providerId: 'nova-local' },
    });
    expect(result.blocks[0].text).toContain('Python 3');
    expect(result.blocks[0].text).toContain('```python');
    expect(result.blocks[0].text).toContain('hello');
  });

  it('parses Python source with summary', async () => {
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from('import os\n\ndef hello():\n    print("hi")\n\nclass Foo:\n    pass'),
      mimeType: 'text/x-python',
      fileName: 'main.py',
      config: { providerId: 'nova-local' },
    });
    expect(result.blocks[0].text).toContain('```python');
    expect(result.blocks[0].text).toContain('Summary');
    expect(result.blocks[0].text).toContain('def hello');
    expect(result.blocks[0].text).toContain('class Foo');
  });

  it('parses RIS reference entries', async () => {
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from(
        'TY  - JOUR\nTI  - Deep Learning\nAU  - Smith, John\nPY  - 2024\nER  - \n',
      ),
      mimeType: 'application/x-research-info-systems',
      fileName: 'refs.ris',
      config: { providerId: 'nova-local' },
    });
    expect(result.blocks[0].text).toContain('Deep Learning');
    expect(result.blocks[0].text).toContain('Smith, John');
    expect(result.blocks[0].text).toContain('2024');
  });

  it('parses YAML', async () => {
    const result = await novaLocalExtractorProvider.extract({
      buffer: Buffer.from('name: Nova\nversion: 2\nfeatures:\n  - mcp\n  - files\n'),
      mimeType: 'application/yaml',
      fileName: 'config.yaml',
      config: { providerId: 'nova-local' },
    });
    expect(result.blocks[0].text).toContain('```yaml');
    expect(result.blocks[0].text).toContain('Nova');
  });
});
