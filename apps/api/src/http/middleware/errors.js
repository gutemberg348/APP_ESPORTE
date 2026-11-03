import { ZodError } from 'zod';
import { AppError } from '../../lib/errors.js';

export function errorHandler(logger) {
  // Express recognizes error middleware by its four arguments.
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (res.writableEnded || res.destroyed) return;
    const requestId = res.locals.requestId;
    const send = (status, code, message, details) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId } });
    if (error instanceof ZodError) return send(422, 'VALIDATION_ERROR', 'Confira os campos informados.', error.issues.map(({ path, message }) => ({ path: path.join('.'), message })));
    if (error.type === 'entity.too.large') return send(413, 'BODY_TOO_LARGE', 'Corpo da requisição excede o limite.');
    if (error.type === 'entity.parse.failed') return send(400, 'INVALID_JSON', 'JSON inválido.');
    if (error.type === 'request.aborted') return send(400, 'REQUEST_ABORTED', 'Requisição interrompida.');
    if (error.type === 'request.size.invalid') return send(400, 'INVALID_BODY_SIZE', 'Tamanho do corpo inválido.');
    if (['charset.unsupported', 'encoding.unsupported'].includes(error.type)) return send(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie JSON UTF-8 sem compressão.');
    if (['P2021', 'P2022'].includes(error.code)) return send(503, 'DATABASE_SCHEMA_OUTDATED', 'O banco precisa ser atualizado. O responsável deve executar npm run db:prepare no servidor.');
    if (['P1001', 'P1002', 'P1008', 'P1017', 'ECONNREFUSED'].includes(error.code)) return send(503, 'DATABASE_UNAVAILABLE', 'O banco de dados está indisponível. Tente novamente em instantes.');
    if (error.code === 'P2002') return send(409, 'CONFLICT', 'Este registro já existe.');
    if (error.code === 'P2034') return send(409, 'CONCURRENT_UPDATE', 'Os dados mudaram durante a operação. Tente novamente.');
    if (error.code === 'P2025') return send(404, 'RECORD_NOT_FOUND', 'Registro não encontrado.');
    if (error instanceof AppError) {
      if (error.status === 401) res.set('WWW-Authenticate', 'Bearer realm="nacional-api"');
      return send(error.status, error.code, error.message);
    }
    logger.error(JSON.stringify({ requestId, message: error.message }));
    return send(500, 'INTERNAL_ERROR', 'Não foi possível concluir a operação.');
  };
}
