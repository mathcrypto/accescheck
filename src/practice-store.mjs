import sourceConfiguration from '../data/source.json' with { type: 'json' };

export const sourceIdentity = Object.freeze(sourceConfiguration);

export class DataUnavailable extends Error {
  constructor() {
    super('Les données ne sont pas encore disponibles. Réessayez après la synchronisation.');
    this.status = 503;
  }
}

export function validateImportMetadata(metadata) {
  if (
    !metadata ||
    metadata.resourceId !== sourceIdentity.resourceId ||
    metadata.datasetId !== sourceIdentity.datasetId
  )
    throw new Error('Source d’import invalide.');
  const url = new URL(metadata.resourceUrl);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'static.data.gouv.fr' ||
    url.username ||
    url.password
  )
    throw new Error('URL de source invalide.');
  if (
    !/^[a-f0-9]{40,64}$/.test(metadata.checksum || '') ||
    !Number.isFinite(Date.parse(metadata.exportedAt))
  )
    throw new Error('Provenance d’import invalide.');
  if (
    !Number.isInteger(metadata.expectedCount) ||
    metadata.expectedCount < 1 ||
    metadata.expectedCount > 20000
  )
    throw new Error('Nombre de cabinets invalide.');
  if (
    !Array.isArray(metadata.columns) ||
    metadata.columns.length > 250 ||
    !metadata.columns.includes('web_url')
  )
    throw new Error('Schéma source invalide.');
  return metadata;
}

export function validateImportedPractice(item) {
  const record = item?.record;
  if (
    !record ||
    record.mode !== 'real' ||
    record.source !== 'Accès Libre' ||
    typeof record.id !== 'string' ||
    !record.id ||
    record.id.length > 150 ||
    typeof record.name !== 'string' ||
    !record.name.trim() ||
    record.name.length > 500 ||
    !/^75\d{3}$/.test(record.postalCode) ||
    typeof record.specialty !== 'string' ||
    typeof record.address !== 'string'
  )
    throw new Error('Cabinet importé invalide.');
  const url = new URL(record.sourceUrl);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'acceslibre.beta.gouv.fr' ||
    url.username ||
    url.password
  )
    throw new Error('Fiche source invalide.');
  for (const key of [
    'stepFree',
    'route',
    'width',
    'hearing',
    'toilets',
    'consultation',
    'signage',
  ]) {
    const field = record.evidence?.[key];
    if (
      !field ||
      field.date !== null ||
      !['unknown', 'declared', 'contradictory'].includes(field.status)
    )
      throw new Error('Preuve source invalide.');
    if (
      field.value !== null &&
      (key === 'width'
        ? !Number.isFinite(field.value) || field.value <= 0
        : typeof field.value !== 'boolean')
    )
      throw new Error('Valeur d’accessibilité invalide.');
  }
  if (
    !item.sourceFields ||
    typeof item.sourceFields !== 'object' ||
    Array.isArray(item.sourceFields) ||
    Object.hasOwn(item.sourceFields, 'widget_code') ||
    JSON.stringify(item).length > 60000
  )
    throw new Error('Champs source invalides.');
  return item;
}

export function createPracticeStore(database) {
  if (!database?.prepare) throw new DataUnavailable();
  const statement = (sql, ...parameters) => database.prepare(sql).bind(...parameters);
  const rows = async (sql, ...parameters) => (await statement(sql, ...parameters).all()).results;
  const first = (sql, ...parameters) => statement(sql, ...parameters).first();
  async function active() {
    const dataset = await first(
      "SELECT d.* FROM datasets d JOIN app_state s ON s.value = d.id WHERE s.key = 'active_dataset' AND d.status = 'active'",
    );
    if (!dataset) throw new DataUnavailable();
    return dataset;
  }
  function provenance(dataset, lastCheckedAt = null) {
    const metadata = JSON.parse(dataset.metadata_json);
    return {
      ...metadata,
      importedAt: dataset.imported_at,
      lastCheckedAt,
      recordCount: dataset.expected_count,
      source: 'Accès Libre',
      stale: Date.now() - Date.parse(lastCheckedAt || dataset.imported_at) > 3 * 86400000,
    };
  }
  return {
    async status() {
      const dataset = await active();
      const checked = await first("SELECT value FROM app_state WHERE key = 'last_checked_at'");
      return provenance(dataset, checked?.value || null);
    },
    async catalog() {
      const dataset = await active();
      const districts = await rows(
        'SELECT DISTINCT postal_code value FROM practices WHERE dataset_id = ? ORDER BY postal_code',
        dataset.id,
      );
      const specialties = await rows(
        'SELECT DISTINCT specialty value FROM practices WHERE dataset_id = ? ORDER BY specialty',
        dataset.id,
      );
      const checked = await first("SELECT value FROM app_state WHERE key = 'last_checked_at'");
      return {
        districts: districts.map((row) => row.value),
        specialties: specialties.map((row) => row.value),
        count: dataset.expected_count,
        dataset: provenance(dataset, checked?.value || null),
      };
    },
    async candidates(filters) {
      const dataset = await active();
      const conditions = ['dataset_id = ?'];
      const parameters = [dataset.id];
      if (filters.district) {
        conditions.push('postal_code = ?');
        parameters.push(filters.district);
      }
      if (filters.specialty) {
        conditions.push('specialty = ?');
        parameters.push(filters.specialty);
      }
      const records = await rows(
        `SELECT record_json FROM practices WHERE ${conditions.join(' AND ')} LIMIT 20001`,
        ...parameters,
      );
      if (records.length > 20000)
        throw new Error('Précisez la zone ou la spécialité de votre recherche.');
      return {
        records: records.map((row) => JSON.parse(row.record_json)),
        dataset: provenance(dataset),
      };
    },
    async get(id) {
      const dataset = await active();
      const row = await first(
        'SELECT record_json, source_json FROM practices WHERE dataset_id = ? AND id = ?',
        dataset.id,
        id,
      );
      return row
        ? {
            ...JSON.parse(row.record_json),
            sourceFields: JSON.parse(row.source_json),
            dataset: provenance(dataset),
          }
        : null;
    },
    async begin(metadata) {
      validateImportMetadata(metadata);
      const fingerprint = `${metadata.resourceId}:${metadata.checksum}:paris-medical-v${sourceIdentity.mappingVersion}`;
      const existing = await first(
        'SELECT id, status FROM datasets WHERE fingerprint = ?',
        fingerprint,
      );
      if (existing?.status === 'active') return { id: existing.id, unchanged: true };
      if (existing?.status === 'staging') return { id: existing.id, unchanged: false };
      if (existing) throw new Error('Cet export a déjà été remplacé.');
      const id = crypto.randomUUID();
      await statement(
        'INSERT INTO datasets (id, fingerprint, status, metadata_json, expected_count, imported_at) VALUES (?, ?, ?, ?, ?, ?)',
        id,
        fingerprint,
        'staging',
        JSON.stringify(metadata),
        metadata.expectedCount,
        new Date().toISOString(),
      ).run();
      return { id, unchanged: false };
    },
    async append(id, items) {
      const dataset = await first('SELECT status FROM datasets WHERE id = ?', id);
      if (
        dataset?.status !== 'staging' ||
        !Array.isArray(items) ||
        items.length < 1 ||
        items.length > 20
      )
        throw new Error('Lot d’import invalide.');
      items.forEach(validateImportedPractice);
      await database.batch(
        items.map(({ record, sourceFields }) =>
          statement(
            'INSERT INTO practices (dataset_id, id, postal_code, specialty, record_json, source_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(dataset_id, id) DO NOTHING',
            id,
            record.id,
            record.postalCode,
            record.specialty,
            JSON.stringify(record),
            JSON.stringify(sourceFields),
          ),
        ),
      );
      return { accepted: items.length };
    },
    async activate(id) {
      const dataset = await first('SELECT * FROM datasets WHERE id = ?', id);
      if (dataset?.status === 'active') return this.status();
      if (!dataset || dataset.status !== 'staging') throw new Error('Import indisponible.');
      const count = await first('SELECT COUNT(*) count FROM practices WHERE dataset_id = ?', id);
      if (count.count !== dataset.expected_count)
        throw new Error('Import incomplet : données précédentes conservées.');
      const previous = await first(
        "SELECT d.id, d.expected_count, d.metadata_json FROM datasets d JOIN app_state s ON s.value = d.id WHERE s.key = 'active_dataset'",
      );
      if (
        previous &&
        Date.parse(JSON.parse(dataset.metadata_json).exportedAt) <
          Date.parse(JSON.parse(previous.metadata_json).exportedAt)
      )
        throw new Error('Export plus ancien : données précédentes conservées.');
      if (previous && count.count < previous.expected_count * 0.8)
        throw new Error(
          'Baisse inhabituelle du nombre de cabinets : données précédentes conservées.',
        );
      await database.batch([
        statement("UPDATE datasets SET status = 'archived' WHERE status = 'active'"),
        statement("UPDATE datasets SET status = 'active' WHERE id = ?", id),
        statement(
          "INSERT INTO app_state (key, value) VALUES ('active_dataset', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          id,
        ),
        statement(
          "INSERT INTO app_state (key, value) VALUES ('last_checked_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          new Date().toISOString(),
        ),
        // Keep the current and previous full snapshots, with older import metadata for audit.
        statement('DELETE FROM practices WHERE dataset_id NOT IN (?, ?)', id, previous?.id || id),
      ]);
      return this.status();
    },
    async checked(checksum) {
      const dataset = await active();
      if (JSON.parse(dataset.metadata_json).checksum !== checksum)
        throw new Error('La source a changé.');
      await statement(
        "INSERT INTO app_state (key, value) VALUES ('last_checked_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        new Date().toISOString(),
      ).run();
      return this.status();
    },
  };
}
