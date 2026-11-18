import { defineEnvVars } from '@sveltejs/kit/env';
import { sailorEnvVars } from 'sailorcms/utils/env';

export const variables = defineEnvVars({
  ...sailorEnvVars
});
