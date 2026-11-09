import express from 'express';
import { AppError } from '../lib/errors.js';

export function createJsonBody(limit = 16384) { return [
  (req, res, next) => {
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie o corpo como application/json.');
    next();
  },
  express.json({
    limit,
    strict: false,
    inflate: false,
    // Retain exact bytes for a future provider's authenticated webhook.
    verify(req, res, buffer) { req.rawBody = Buffer.from(buffer); },
  }),
  (req, res, next) => {
    if (!req.rawBody?.length) throw new AppError(400, 'INVALID_JSON', 'JSON inválido.');
    next();
  },
]; }
export const jsonBody = createJsonBody();
