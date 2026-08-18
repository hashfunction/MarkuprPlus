import { describe, expect, it } from 'vitest';
import { generateHtmlDocument } from '../../src/main/output/templates/html-template';

describe('HTML export security', () => {
  it('adds a restrictive CSP while escaping report content', () => {
    const html = generateHtmlDocument({
      id: 'session-1',
      startTime: 0,
      endTime: 1000,
      transcription: '</style><script>window.pwned=true</script>',
      feedbackItems: [],
    }, {
      projectName: '</style><script>window.pwned=true</script>',
      includeImages: false,
    });

    expect(html).toContain("default-src 'none'; img-src data: file:; style-src 'unsafe-inline'; font-src data:");
    expect(html).toContain('&lt;/style&gt;&lt;script&gt;window.pwned=true&lt;/script&gt;');
    expect(html).not.toContain('<script>window.pwned=true</script>');
  });
});
