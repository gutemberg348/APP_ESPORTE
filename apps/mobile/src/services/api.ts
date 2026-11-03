import { send, ApiError } from './api-transport';
import { authClient } from './auth-client';
import { createAuthenticatedRequest } from './authenticated-request';
export { ApiError } from './api-transport';
export const request = createAuthenticatedRequest(send, authClient, ApiError);
