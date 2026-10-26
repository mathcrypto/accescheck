import { interpretNeeds } from './needs-agent.mjs';
import { accessProfile } from '../profile-core.mjs';

export async function extractAccessProfile(body, env = {}, transport = fetch, signal) {
  const result = await interpretNeeds(body, env, (url, options) =>
    transport(url, {
      ...options,
      signal: AbortSignal.any([options.signal, ...(signal ? [signal] : [])]),
    }),
  );
  const profile = accessProfile({ keys: result.keys, minWidth: result.minWidth });
  return { keys: profile.keys, minWidth: profile.minWidth, requiresConfirmation: true };
}
