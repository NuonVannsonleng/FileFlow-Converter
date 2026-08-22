import { Router } from 'express';
import type { FormatsResponse } from '@shared';
import { FORMATS } from '../services/conversion/formats.js';
import { capabilities, listConversions } from '../services/conversion/registry.js';

export const formatsRouter: Router = Router();

/**
 * The client renders its entire format picker from this response, so a
 * conversion that is not listed here can never be offered in the UI.
 */
formatsRouter.get('/formats', (_req, res) => {
  const body: FormatsResponse = {
    formats: FORMATS,
    conversions: listConversions(),
    capabilities: capabilities(),
  };
  // Capabilities only change on restart, so a short cache is safe and cheap.
  res.set('Cache-Control', 'public, max-age=60');
  res.json(body);
});
