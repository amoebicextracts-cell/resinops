import test from 'node:test';
import assert from 'node:assert/strict';

import { formatApiError } from '../src/lib/apiErrors.js';

test('API errors include a request reference when the server provides one', () => {
  const response = { headers: new Headers({ 'x-request-id': 'request_12345678' }) };
  assert.equal(
    formatApiError(response, { error: 'Service unavailable' }),
    'Service unavailable (Reference: request_12345678)',
  );
});

test('API errors fall back safely without a response body or reference', () => {
  assert.equal(formatApiError(null, null, 'Request failed safely'), 'Request failed safely');
});
