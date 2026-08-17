import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/renderer/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      accent: { default: '#0066cc' },
      bg: { tertiary: '#eeeeee' },
      border: { default: '#cccccc' },
      status: { error: '#cc0000', success: '#008800' },
      text: { inverse: '#ffffff' },
    },
  }),
}));

import { ApiKeyInput } from '../../src/renderer/components/primitives/ApiKeyInput';

describe('API key verification copy', () => {
  it('does not claim a verified stored key was saved securely', () => {
    const markup = renderToStaticMarkup(React.createElement(ApiKeyInput, {
      label: 'OpenAI API Key',
      serviceName: 'OpenAI',
      apiKey: {
        value: '********',
        visible: false,
        testing: false,
        valid: true,
        error: null,
      },
      onApiKeyChange: () => undefined,
      onToggleVisibility: () => undefined,
      onTest: () => undefined,
    }));

    expect(markup).toContain('API key verified.');
    expect(markup).not.toContain('saved securely');
  });
});
