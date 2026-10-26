import { criteria } from './core.mjs';

export const profileKey = 'accescheck.access-profile.v1';
export const profileLifetime = 30 * 24 * 60 * 60 * 1000;

export function accessProfile(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['keys', 'minWidth', 'fictional'].includes(key)) ||
    !Array.isArray(value.keys) ||
    !value.keys.length ||
    value.keys.length > Object.keys(criteria).length ||
    value.keys.some((key) => !Object.hasOwn(criteria, key)) ||
    new Set(value.keys).size !== value.keys.length ||
    (value.minWidth !== null &&
      (!Number.isFinite(value.minWidth) ||
        value.minWidth < 40 ||
        value.minWidth > 200 ||
        !value.keys.includes('width'))) ||
    (value.fictional !== undefined && typeof value.fictional !== 'boolean')
  )
    throw new Error('Vérifiez les critères du profil et la largeur mesurée, entre 40 et 200 cm.');
  return { keys: [...value.keys], minWidth: value.minWidth, fictional: value.fictional === true };
}

export function saveProfile(storage, value, consent, now = Date.now()) {
  if (consent !== true)
    throw new Error('Votre accord est nécessaire pour conserver ce profil sur cet appareil.');
  const profile = {
    ...accessProfile(value),
    version: 1,
    savedAt: now,
    expiresAt: now + profileLifetime,
  };
  storage.setItem(profileKey, JSON.stringify(profile));
  return profile;
}

export function readProfile(storage, now = Date.now()) {
  const raw = storage.getItem(profileKey);
  if (!raw) return null;
  try {
    if (raw.length > 2000) throw new Error('Invalid profile');
    const value = JSON.parse(raw);
    if (
      !value ||
      Object.keys(value).some(
        (key) =>
          !['keys', 'minWidth', 'fictional', 'version', 'savedAt', 'expiresAt'].includes(key),
      ) ||
      value.version !== 1 ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt !== value.savedAt + profileLifetime
    )
      throw new Error('Invalid profile');
    return {
      ...accessProfile({ keys: value.keys, minWidth: value.minWidth, fictional: value.fictional }),
      version: 1,
      savedAt: value.savedAt,
      expiresAt: value.expiresAt,
    };
  } catch {
    storage.removeItem(profileKey);
    return null;
  }
}

export function profileDescription(value) {
  const profile = accessProfile({
    keys: value.keys,
    minWidth: value.minWidth,
    fictional: value.fictional,
  });
  return [
    profile.fictional
      ? 'Exemple fictif à tester, pas mes besoins réels.'
      : 'Pour ma recherche, voici mes besoins d’accès à vérifier :',
    ...profile.keys.map((key) => criteria[key].label),
    ...(profile.minWidth !== null ? [`Passage utile d’au moins ${profile.minWidth} cm.`] : []),
    'Demandez-moi la profession et le lieu pour cette nouvelle recherche.',
  ].join('\n');
}
