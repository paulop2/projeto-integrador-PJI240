import type { PagesHandler } from '../../_types';
import { handleZitadelLogin } from '../../../src/server/zitadel-login';

export const onRequest: PagesHandler = ({ request, env }) => handleZitadelLogin(request, env);
