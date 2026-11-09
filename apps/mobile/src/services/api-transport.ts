import { config } from '../config/env';
import { createApiTransport } from './api-transport-core';
export { ApiError, type RequestOptions } from './api-transport-core';
export const send = createApiTransport(() => config.apiUrl);
