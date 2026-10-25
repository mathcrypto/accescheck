// src/core.mjs
var criteria = {
  stepFree: {
    label: "Entr\xE9e sans marche",
    question: "L\u2019entr\xE9e est-elle de plain-pied, sans marche ni seuil ?"
  },
  route: {
    label: "Trajet jusqu\u2019\xE0 l\u2019accueil",
    question: "Le trajet jusqu\u2019\xE0 l\u2019accueil est-il sans marche ? Et jusqu\u2019\xE0 la salle de consultation ?"
  },
  width: {
    label: "Largeur de la porte d\u2019entr\xE9e",
    question: "Quelle est la largeur utile minimale des portes et passages ?"
  },
  hearing: {
    label: "\xC9quipement auditif",
    question: "Disposez-vous d\u2019une boucle \xE0 induction ou d\u2019un autre \xE9quipement auditif ?"
  },
  toilets: {
    label: "Sanitaires adapt\xE9s",
    question: "Les sanitaires sont-ils adapt\xE9s et disponibles pendant la visite ?"
  },
  consultation: {
    label: "Salle de consultation accessible",
    question: "La salle et les \xE9quipements de consultation conviennent-ils \xE0 mes besoins, notamment pour le transfert ?"
  },
  signage: {
    label: "Signal\xE9tique int\xE9rieure",
    question: "Une signal\xE9tique lisible et compr\xE9hensible permet-elle de s\u2019orienter ?"
  }
};
function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Param\xE8tres invalides.");
  if (typeof input.needs !== "string" || input.needs.length > 2e3)
    throw new Error("D\xE9crivez vos besoins en 2 000 caract\xE8res maximum.");
  for (const key of ["specialty", "district", "mode"])
    if (input[key] !== void 0 && (typeof input[key] !== "string" || input[key].length > 100))
      throw new Error("Filtre invalide.");
  if (input.mode !== void 0 && input.mode !== "real") {
    throw new Error("Seuls les cabinets import\xE9s depuis Acc\xE8s Libre sont disponibles.");
  }
  if (input.width !== void 0 && (!Number.isFinite(input.width) || input.width < 40 || input.width > 200))
    throw new Error("Largeur attendue : 40 \xE0 200 cm.");
  return input;
}
function parseNeeds(text, width) {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const keys = /* @__PURE__ */ new Set();
  const wheelchair = /fauteuil|wheelchair|mobilite reduite|deambulateur/.test(t);
  if (wheelchair || /sans marche|plain.pied|step.free|bequille/.test(t)) {
    keys.add("stepFree");
    keys.add("route");
  }
  if (wheelchair) {
    keys.add("width");
    keys.add("consultation");
  }
  if (/malentendant|sourd|auditi|hard of hearing|hearing/.test(t)) keys.add("hearing");
  if (/toilet|sanitaire/.test(t)) keys.add("toilets");
  if (/malvoyant|aveugle|signaleti|visuel|blind/.test(t)) keys.add("signage");
  if (/transfert|transfer/.test(t)) keys.add("consultation");
  const match = t.match(/\b(\d{2,3})\s*cm\b/);
  const requested = width ?? (match ? Number(match[1]) : null);
  if (requested !== null && (requested < 40 || requested > 200))
    throw new Error("Largeur attendue : 40 \xE0 200 cm.");
  if (requested !== null) keys.add("width");
  return {
    keys: [...keys],
    minWidth: requested,
    clarification: keys.size === 0 ? "Pr\xE9cisez un besoin ou s\xE9lectionnez un exemple ci-dessus." : keys.has("width") && requested === null ? "Quelle largeur de passage vous faut-il ? Renseignez-la pour comparer les portes ; aucun seuil n\u2019est suppos\xE9." : null,
    parser: "R\xE8gles locales explicites, sans mod\xE8le IA"
  };
}
function evidenceState(field, now = /* @__PURE__ */ new Date()) {
  if (!field || field.value === null || field.value === void 0) return "unknown";
  if (field.status === "contradictory") return "contradictory";
  if (field.date && Number.isFinite(Date.parse(field.date))) {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
    if (new Date(field.date) < cutoff) return "stale";
  }
  return ["photo", "patient", "declared"].includes(field.status) ? field.status : "declared";
}
function criterionFit(key, value, state, minWidth) {
  if (["unknown", "contradictory", "stale"].includes(state)) {
    return "unknown";
  }
  if (key === "width") {
    if (minWidth === null) return "unknown";
    return value >= minWidth ? "met" : "unmet";
  }
  if (value === true) return "met";
  if (value === false) return "unmet";
  return "unknown";
}
function assess(practice, needs, now = /* @__PURE__ */ new Date()) {
  const checks = needs.keys.map((key) => {
    const field = practice.evidence[key] || { value: null, status: "unknown" };
    const state = evidenceState(field, now);
    const fit = criterionFit(key, field.value, state, needs.minWidth);
    return {
      key,
      label: criteria[key].label,
      value: field.value ?? null,
      state,
      fit,
      source: field.source || practice.source,
      date: field.date || null,
      question: criteria[key].question
    };
  });
  const met = checks.filter((c) => c.fit === "met").length, unmet = checks.filter((c) => c.fit === "unmet").length, unknown = checks.length - met - unmet;
  return {
    ...practice,
    checks,
    met,
    unmet,
    unknown,
    category: unmet ? "obstacle" : unknown ? "check" : checks.length ? "supported" : "unassessed",
    score: unmet ? -1e3 - unmet * 10 + met : met * 10 - unknown
  };
}
function search(practices, input) {
  validateInput(input);
  const needs = parseNeeds(input.needs, input.width);
  const results = practices.filter((practice) => practice.mode === "real").filter((p) => !input.district || p.postalCode === input.district).filter((p) => !input.specialty || p.specialty === input.specialty).map((p) => assess(p, needs)).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"));
  return {
    needs,
    results,
    mode: "real",
    ranking: "Besoins document\xE9s, puis inconnus ; obstacles connus en dernier. Pas de distance calcul\xE9e."
  };
}
function briefing(practice, needs) {
  const result = assess(practice, needs);
  return {
    name: practice.name,
    address: practice.address,
    mode: practice.mode,
    known: result.checks.filter((c) => c.fit === "met").map((c) => c.label),
    obstacles: result.checks.filter((c) => c.fit === "unmet").map((c) => c.label),
    questions: result.checks.filter((c) => c.fit !== "met").map((c) => c.question),
    script: "Bonjour, je souhaite prendre rendez-vous. Pouvez-vous confirmer les points suivants pour pr\xE9parer mon d\xE9placement ?",
    doctolibUrl: safeDoctolib(practice.doctolibUrl),
    sourceUrl: practice.sourceUrl
  };
}
function safeDoctolib(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && ["www.doctolib.fr", "doctolib.fr"].includes(u.hostname) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

// data/source.json
var source_default = {
  datasetId: "60a528e8b656ce01b4c0c0a6",
  resourceId: "93ae96a7-1db7-4cb4-a9f1-6d778370b640",
  resourceTitle: "acceslibre-with-web-url.csv",
  postalPrefix: "75",
  mappingVersion: 1,
  publisher: "Acc\xE8s Libre \u2014 Minist\xE8re de la Transition \xE9cologique",
  license: "Licence Ouverte / Etalab 2.0",
  datasetUrl: "https://www.data.gouv.fr/datasets/acceslibre/"
};

// src/practice-store.mjs
var sourceIdentity = Object.freeze(source_default);
var DataUnavailable = class extends Error {
  constructor() {
    super("Les donn\xE9es ne sont pas encore disponibles. R\xE9essayez apr\xE8s la synchronisation.");
    this.status = 503;
  }
};
function validateImportMetadata(metadata) {
  if (!metadata || metadata.resourceId !== sourceIdentity.resourceId || metadata.datasetId !== sourceIdentity.datasetId)
    throw new Error("Source d\u2019import invalide.");
  const url = new URL(metadata.resourceUrl);
  if (url.protocol !== "https:" || url.hostname !== "static.data.gouv.fr" || url.username || url.password)
    throw new Error("URL de source invalide.");
  if (!/^[a-f0-9]{40,64}$/.test(metadata.checksum || "") || !Number.isFinite(Date.parse(metadata.exportedAt)))
    throw new Error("Provenance d\u2019import invalide.");
  if (!Number.isInteger(metadata.expectedCount) || metadata.expectedCount < 1 || metadata.expectedCount > 2e4)
    throw new Error("Nombre de cabinets invalide.");
  if (!Array.isArray(metadata.columns) || metadata.columns.length > 250 || !metadata.columns.includes("web_url"))
    throw new Error("Sch\xE9ma source invalide.");
  return metadata;
}
function validateImportedPractice(item) {
  const record = item?.record;
  if (!record || record.mode !== "real" || record.source !== "Acc\xE8s Libre" || typeof record.id !== "string" || !record.id || record.id.length > 150 || typeof record.name !== "string" || !record.name.trim() || record.name.length > 500 || !/^75\d{3}$/.test(record.postalCode) || typeof record.specialty !== "string" || typeof record.address !== "string")
    throw new Error("Cabinet import\xE9 invalide.");
  const url = new URL(record.sourceUrl);
  if (url.protocol !== "https:" || url.hostname !== "acceslibre.beta.gouv.fr" || url.username || url.password)
    throw new Error("Fiche source invalide.");
  for (const key of [
    "stepFree",
    "route",
    "width",
    "hearing",
    "toilets",
    "consultation",
    "signage"
  ]) {
    const field = record.evidence?.[key];
    if (!field || field.date !== null || !["unknown", "declared", "contradictory"].includes(field.status))
      throw new Error("Preuve source invalide.");
    if (field.value !== null && (key === "width" ? !Number.isFinite(field.value) || field.value <= 0 : typeof field.value !== "boolean"))
      throw new Error("Valeur d\u2019accessibilit\xE9 invalide.");
  }
  if (!item.sourceFields || typeof item.sourceFields !== "object" || Array.isArray(item.sourceFields) || Object.hasOwn(item.sourceFields, "widget_code") || JSON.stringify(item).length > 6e4)
    throw new Error("Champs source invalides.");
  return item;
}
function createPracticeStore(database) {
  if (!database?.prepare) throw new DataUnavailable();
  const statement = (sql, ...parameters) => database.prepare(sql).bind(...parameters);
  const rows = async (sql, ...parameters) => (await statement(sql, ...parameters).all()).results;
  const first = (sql, ...parameters) => statement(sql, ...parameters).first();
  async function active() {
    const dataset = await first(
      "SELECT d.* FROM datasets d JOIN app_state s ON s.value = d.id WHERE s.key = 'active_dataset' AND d.status = 'active'"
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
      source: "Acc\xE8s Libre",
      stale: Date.now() - Date.parse(lastCheckedAt || dataset.imported_at) > 3 * 864e5
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
        "SELECT DISTINCT postal_code value FROM practices WHERE dataset_id = ? ORDER BY postal_code",
        dataset.id
      );
      const specialties = await rows(
        "SELECT DISTINCT specialty value FROM practices WHERE dataset_id = ? ORDER BY specialty",
        dataset.id
      );
      const checked = await first("SELECT value FROM app_state WHERE key = 'last_checked_at'");
      return {
        districts: districts.map((row) => row.value),
        specialties: specialties.map((row) => row.value),
        count: dataset.expected_count,
        dataset: provenance(dataset, checked?.value || null)
      };
    },
    async candidates(filters) {
      const dataset = await active();
      const conditions = ["dataset_id = ?"];
      const parameters = [dataset.id];
      if (filters.district) {
        conditions.push("postal_code = ?");
        parameters.push(filters.district);
      }
      if (filters.specialty) {
        conditions.push("specialty = ?");
        parameters.push(filters.specialty);
      }
      const records = await rows(
        `SELECT record_json FROM practices WHERE ${conditions.join(" AND ")} LIMIT 20001`,
        ...parameters
      );
      if (records.length > 2e4)
        throw new Error("Pr\xE9cisez la zone ou la sp\xE9cialit\xE9 de votre recherche.");
      return {
        records: records.map((row) => JSON.parse(row.record_json)),
        dataset: provenance(dataset)
      };
    },
    async get(id) {
      const dataset = await active();
      const row = await first(
        "SELECT record_json, source_json FROM practices WHERE dataset_id = ? AND id = ?",
        dataset.id,
        id
      );
      return row ? {
        ...JSON.parse(row.record_json),
        sourceFields: JSON.parse(row.source_json),
        dataset: provenance(dataset)
      } : null;
    },
    async begin(metadata) {
      validateImportMetadata(metadata);
      const fingerprint = `${metadata.resourceId}:${metadata.checksum}:paris-medical-v${sourceIdentity.mappingVersion}`;
      const existing = await first(
        "SELECT id, status FROM datasets WHERE fingerprint = ?",
        fingerprint
      );
      if (existing?.status === "active") return { id: existing.id, unchanged: true };
      if (existing?.status === "staging") return { id: existing.id, unchanged: false };
      if (existing) throw new Error("Cet export a d\xE9j\xE0 \xE9t\xE9 remplac\xE9.");
      const id = crypto.randomUUID();
      await statement(
        "INSERT INTO datasets (id, fingerprint, status, metadata_json, expected_count, imported_at) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        fingerprint,
        "staging",
        JSON.stringify(metadata),
        metadata.expectedCount,
        (/* @__PURE__ */ new Date()).toISOString()
      ).run();
      return { id, unchanged: false };
    },
    async append(id, items) {
      const dataset = await first("SELECT status FROM datasets WHERE id = ?", id);
      if (dataset?.status !== "staging" || !Array.isArray(items) || items.length < 1 || items.length > 20)
        throw new Error("Lot d\u2019import invalide.");
      items.forEach(validateImportedPractice);
      await database.batch(
        items.map(
          ({ record, sourceFields }) => statement(
            "INSERT INTO practices (dataset_id, id, postal_code, specialty, record_json, source_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(dataset_id, id) DO NOTHING",
            id,
            record.id,
            record.postalCode,
            record.specialty,
            JSON.stringify(record),
            JSON.stringify(sourceFields)
          )
        )
      );
      return { accepted: items.length };
    },
    async activate(id) {
      const dataset = await first("SELECT * FROM datasets WHERE id = ?", id);
      if (dataset?.status === "active") return this.status();
      if (!dataset || dataset.status !== "staging") throw new Error("Import indisponible.");
      const count = await first("SELECT COUNT(*) count FROM practices WHERE dataset_id = ?", id);
      if (count.count !== dataset.expected_count)
        throw new Error("Import incomplet : donn\xE9es pr\xE9c\xE9dentes conserv\xE9es.");
      const previous = await first(
        "SELECT d.id, d.expected_count, d.metadata_json FROM datasets d JOIN app_state s ON s.value = d.id WHERE s.key = 'active_dataset'"
      );
      if (previous && Date.parse(JSON.parse(dataset.metadata_json).exportedAt) < Date.parse(JSON.parse(previous.metadata_json).exportedAt))
        throw new Error("Export plus ancien : donn\xE9es pr\xE9c\xE9dentes conserv\xE9es.");
      if (previous && count.count < previous.expected_count * 0.8)
        throw new Error(
          "Baisse inhabituelle du nombre de cabinets : donn\xE9es pr\xE9c\xE9dentes conserv\xE9es."
        );
      await database.batch([
        statement("UPDATE datasets SET status = 'archived' WHERE status = 'active'"),
        statement("UPDATE datasets SET status = 'active' WHERE id = ?", id),
        statement(
          "INSERT INTO app_state (key, value) VALUES ('active_dataset', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          id
        ),
        statement(
          "INSERT INTO app_state (key, value) VALUES ('last_checked_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          (/* @__PURE__ */ new Date()).toISOString()
        ),
        // Keep the current and previous full snapshots, with older import metadata for audit.
        statement("DELETE FROM practices WHERE dataset_id NOT IN (?, ?)", id, previous?.id || id)
      ]);
      return this.status();
    },
    async checked(checksum) {
      const dataset = await active();
      if (JSON.parse(dataset.metadata_json).checksum !== checksum)
        throw new Error("La source a chang\xE9.");
      await statement(
        "INSERT INTO app_state (key, value) VALUES ('last_checked_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (/* @__PURE__ */ new Date()).toISOString()
      ).run();
      return this.status();
    }
  };
}

// src/practice-tools.mjs
var searchProperties = {
  needs: { type: "string", maxLength: 2e3 },
  width: { type: "number", minimum: 40, maximum: 200 },
  district: { type: "string" },
  specialty: { type: "string" },
  mode: { type: "string", enum: ["real"] },
  page: { type: "integer", minimum: 1, maximum: 1e5 },
  pageSize: { type: "integer", minimum: 1, maximum: 100 }
};
var inputSchema = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});
var practiceTools = [
  {
    name: "search_practices",
    description: "Rechercher les cabinets import\xE9s depuis Acc\xE8s Libre, avec provenance et pagination. Aucun cr\xE9neau ni r\xE9servation.",
    inputSchema: inputSchema(searchProperties, ["needs"])
  },
  {
    name: "get_practice_accessibility",
    description: "Lire les crit\xE8res et les champs publics de la fiche Acc\xE8s Libre d\u2019un cabinet, avec la provenance de l\u2019import.",
    inputSchema: inputSchema({ id: { type: "string", maxLength: 150 } }, ["id"])
  },
  {
    name: "create_visit_briefing",
    description: "Pr\xE9parer les questions \xE0 poser au cabinet \xE0 partir des informations document\xE9es, sans conseil m\xE9dical.",
    inputSchema: inputSchema({ ...searchProperties, id: { type: "string", maxLength: 150 } }, [
      "id",
      "needs"
    ])
  }
];
async function runPracticeTool(name, args, database) {
  const tool = practiceTools.find((tool2) => tool2.name === name);
  if (!tool || !args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Outil ou arguments invalides.");
  if (Object.keys(args).some((key) => !Object.hasOwn(tool.inputSchema.properties, key)))
    throw new Error("Param\xE8tre inconnu.");
  for (const required of tool.inputSchema.required)
    if (args[required] === void 0) throw new Error("Param\xE8tre requis : " + required);
  const store = createPracticeStore(database);
  if (name === "search_practices") {
    validateInput(args);
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || page > 1e5 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new Error("Pagination invalide.");
    const { records, dataset } = await store.candidates(args);
    const ranked = search(records, args);
    return {
      ...ranked,
      results: ranked.results.slice((page - 1) * pageSize, page * pageSize),
      total: ranked.results.length,
      page,
      pageSize,
      dataset,
      datasetDate: dataset.exportedAt.slice(0, 10)
    };
  }
  if (typeof args.id !== "string" || !args.id || args.id.length > 150)
    throw new Error("Identifiant invalide.");
  const practice = await store.get(args.id);
  if (!practice) throw new Error("\xC9tablissement introuvable.");
  if (name === "get_practice_accessibility")
    return {
      ...practice,
      evidence: Object.fromEntries(
        Object.entries(practice.evidence).map(([key, value]) => [
          key,
          { ...value, state: evidenceState(value) }
        ])
      )
    };
  validateInput(args);
  return { ...briefing(practice, parseNeeds(args.needs, args.width)), dataset: practice.dataset };
}
async function practiceSummary(database, id) {
  if (typeof id !== "string" || !id || id.length > 150) return null;
  const practice = await createPracticeStore(database).get(id);
  return practice ? {
    name: practice.name,
    address: practice.address,
    doctolibUrl: safeDoctolib(practice.doctolibUrl),
    evidence: practice.evidence,
    sourceFields: practice.sourceFields,
    sourceUrl: practice.sourceUrl,
    dataset: practice.dataset
  } : null;
}

// src/speech.mjs
var requestedVoice = "pFZP5JQG7iQjIQuC4Bku";
function speechConfig(env = {}) {
  return {
    elevenlabsAvailable: !!env.ELEVENLABS_API_KEY,
    voiceId: env.ELEVENLABS_VOICE_ID || requestedVoice
  };
}
async function generateSpeech(body, env = {}, transport = fetch) {
  const headers2 = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  const fail = (error, status) => new Response(JSON.stringify({ error }), { status, headers: headers2 });
  if (!body || typeof body !== "object" || typeof body.text !== "string" || !body.text.trim() || body.text.length > 4e3 || body.consent !== true)
    return fail(
      "Texte requis (4 000 caract\xE8res maximum) et accord explicite pour ElevenLabs.",
      400
    );
  if (body.rate !== void 0 && (!Number.isFinite(body.rate) || body.rate < 0.7 || body.rate > 1.2))
    return fail("Vitesse de lecture invalide.", 400);
  const config = speechConfig(env);
  if (!config.elevenlabsAvailable)
    return fail(
      "La voix ElevenLabs n\u2019est pas activ\xE9e. Utilisez la voix fran\xE7aise de votre appareil.",
      503
    );
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(config.voiceId))
    return fail("La configuration de la voix doit \xEAtre corrig\xE9e.", 503);
  try {
    const r = await transport(
      "https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(config.voiceId) + "?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text: body.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: body.rate || 1 }
        }),
        signal: AbortSignal.timeout(2e4)
      }
    );
    if (!r.ok)
      return fail(
        r.status === 429 ? "Quota vocal atteint. Utilisez la voix de votre appareil." : "La voix ElevenLabs est indisponible. V\xE9rifiez son activation ou choisissez la voix de votre appareil.",
        r.status === 429 ? 429 : 502
      );
    if (!r.headers.get("content-type")?.startsWith("audio/"))
      return fail("Le service vocal n\u2019a pas renvoy\xE9 un son lisible.", 502);
    return new Response(r.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return fail("Le service vocal n\u2019a pas r\xE9pondu. Utilisez la voix de votre appareil.", 502);
  }
}

// src/handler.mjs
var headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};
var json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
async function readJson(request, limit) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("Requ\xEAte trop volumineuse.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("JSON invalide.");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("Requ\xEAte trop volumineuse.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error.message === "Requ\xEAte trop volumineuse.") throw error;
    throw new Error("JSON invalide.", { cause: error });
  }
}
async function authorizedImport(request, expected) {
  if (!expected || typeof expected !== "string") return false;
  const actual = request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [actual, expected].map((text) => crypto.subtle.digest("SHA-256", encoder.encode(text)))
  );
  return new Uint8Array(a).every((value, index) => value === new Uint8Array(b)[index]);
}
async function importRequest(request, env, path) {
  if (!await authorizedImport(request, env.DATA_IMPORT_TOKEN))
    return json({ error: "Acc\xE8s \xE0 l\u2019import refus\xE9." }, 403);
  const store = createPracticeStore(env.DB);
  if (request.method === "GET" && path === "/internal/import/status") {
    try {
      return json(await store.status());
    } catch (error) {
      if (error instanceof DataUnavailable) return json({ empty: true });
      throw error;
    }
  }
  if (request.method !== "POST") return json({ error: "M\xE9thode non autoris\xE9e." }, 405);
  const body = await readJson(request, 15e5);
  if (path === "/internal/import/start") return json(await store.begin(body));
  if (path === "/internal/import/batch") return json(await store.append(body.id, body.records));
  if (path === "/internal/import/activate") return json(await store.activate(body.id));
  if (path === "/internal/import/checked") return json(await store.checked(body.checksum));
  return json({ error: "Route introuvable." }, 404);
}
function createHandler({ home, searchPage, consultationPage }) {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      try {
        if (request.method === "GET" && ["/", "/cabinets", "/consultation", "/consultation/"].includes(url.pathname))
          return new Response(
            url.pathname === "/" ? home : url.pathname === "/cabinets" ? searchPage : consultationPage,
            {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
              }
            }
          );
        const origin = request.headers.get("Origin");
        if (origin && origin !== url.origin || request.headers.get("sec-fetch-site") === "cross-site")
          return json({ error: "Origine non autoris\xE9e." }, 403);
        if (url.pathname.startsWith("/internal/import/"))
          return await importRequest(request, env, url.pathname);
        if (request.method === "GET" && url.pathname === "/api/voice-config")
          return json(speechConfig(env));
        if (request.method === "GET" && url.pathname === "/api/practice") {
          const practice = await practiceSummary(env.DB, url.searchParams.get("id"));
          return practice ? json(practice) : json({ error: "\xC9tablissement introuvable." }, 404);
        }
        if (request.method === "GET" && url.pathname === "/api/catalog")
          return json(await createPracticeStore(env.DB).catalog());
        if (request.method === "GET" && url.pathname === "/api/data-status")
          return json(await createPracticeStore(env.DB).status());
        if (request.method === "GET" && url.pathname === "/health")
          return json({ ok: true, version: "0.5.0" });
        if (request.method !== "POST") return json({ error: "Route introuvable." }, 404);
        const body = await readJson(request, 12e3);
        if (url.pathname === "/api/speech") return generateSpeech(body, env);
        if (url.pathname === "/mcp") {
          if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string" || Array.isArray(body))
            return json(
              { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } },
              400
            );
          const id = body.id ?? null;
          let result;
          if (body.method.startsWith("notifications/")) return new Response(null, { status: 202 });
          if (body.method === "server/discover")
            result = { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } };
          else if (body.method === "initialize")
            result = {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "accescompanion", version: "0.5.0" }
            };
          else if (body.method === "ping") result = {};
          else if (body.method === "tools/list") result = { tools: practiceTools };
          else if (body.method === "tools/call") {
            try {
              result = {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      await runPracticeTool(body.params?.name, body.params?.arguments, env.DB)
                    )
                  }
                ]
              };
            } catch (error) {
              result = { isError: true, content: [{ type: "text", text: error.message }] };
            }
          } else
            return json({
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: "Method not found" }
            });
          return json({ jsonrpc: "2.0", id, result });
        }
        if (url.pathname === "/api/search")
          return json(await runPracticeTool("search_practices", body, env.DB));
        if (url.pathname === "/api/briefing")
          return json(await runPracticeTool("create_visit_briefing", body, env.DB));
        return json({ error: "Route introuvable." }, 404);
      } catch (error) {
        return json(
          { error: error.message },
          error.status || (error.message.includes("volumineuse") ? 413 : 400)
        );
      }
    }
  };
}

// <stdin>
var stdin_default = createHandler({ "home": `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#184c42" />
    <meta
      name="description"
      content="Voir ce qui est connu avant de r\xE9server un cabinet \xE0 Paris. accescompanion montre ce qui est document\xE9, ce qui ne l\u2019est pas, et reste pendant la visite."
    />
    <title>accescompanion</title>
    <style>
      :root {
        --ink: #17332c;
        --green: #1b5344;
        --mint: #eaf1e9;
        --cream: #f6f8f4;
        --line: #e3ebe4;
        --muted: #5d6e66;
        --amber: #88601c;
        --amber-bg: #fbf3e3;
        --red: #9a4234;
        --red-bg: #f9ece9;
        --grey-bg: #eef0ee;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: #fff;
        color: var(--ink);
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        font-size: 17px;
        line-height: 1.5;
      }
      a {
        color: var(--green);
      }
      button,
      a {
        outline-offset: 4px;
      }
      :focus-visible {
        outline: 3px solid #b16830;
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .skip {
        position: absolute;
        top: -100px;
      }
      .skip:focus {
        top: 8px;
        left: 12px;
        z-index: 5;
        background: #fff;
        padding: 12px;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 28px;
        border-bottom: 1px solid var(--line);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: var(--ink);
      }
      .mark {
        width: 36px;
        height: 36px;
        display: block;
        flex: none;
      }
      .wordmark {
        font-weight: 720;
        letter-spacing: -0.06em;
        font-size: 21px;
        line-height: 1;
      }
      .wordmark i {
        font-family: Georgia, 'Iowan Old Style', serif;
        font-style: italic;
        font-weight: 520;
        color: var(--green);
        letter-spacing: -0.03em;
      }
      nav {
        display: flex;
        gap: 8px;
      }
      nav a {
        color: var(--ink);
        text-decoration: none;
        font-size: 15px;
        font-weight: 650;
        padding: 8px 12px;
        border-radius: 999px;
      }
      nav a:hover {
        background: var(--mint);
        color: var(--green);
      }
      .wrap {
        max-width: 1080px;
        margin: 0 auto;
        padding: 0 24px;
      }
      section {
        padding: 56px 0;
      }
      section + section {
        border-top: 1px solid var(--line);
      }
      .kicker {
        font-size: 13px;
        letter-spacing: 0.08em;
        font-weight: 700;
        color: var(--green);
        margin: 0 0 16px;
        text-transform: uppercase;
      }
      h1 {
        font-size: clamp(32px, 4vw, 46px);
        font-weight: 700;
        letter-spacing: -0.04em;
        line-height: 1.08;
        margin: 0;
        max-width: 14em;
      }
      h1 em {
        font-family: Georgia, 'Iowan Old Style', serif;
        font-weight: 400;
        font-style: italic;
        color: var(--green);
        letter-spacing: -0.02em;
      }
      h2 {
        font-size: clamp(26px, 3.2vw, 34px);
        font-weight: 680;
        letter-spacing: -0.03em;
        line-height: 1.15;
        margin: 0 0 12px;
      }
      h3 {
        font-size: 18px;
        margin: 0 0 6px;
        letter-spacing: -0.01em;
      }
      .lede {
        font-size: 20px;
        color: #3e564b;
        max-width: 34rem;
        margin: 22px 0 0;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.9fr);
        gap: 40px;
        align-items: start;
        padding: 36px 0 8px;
      }
      .cta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 32px 0 0;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 12px 20px;
        border-radius: 12px;
        font-weight: 650;
        font-size: 16px;
        text-decoration: none;
      }
      .btn.primary {
        background: var(--green);
        color: #fff;
      }
      .btn.primary:hover {
        background: #143f34;
      }
      .btn.ghost {
        border: 1.5px solid #c9d8cc;
        color: var(--green);
        background: #fff;
      }
      .btn.ghost:hover {
        border-color: var(--green);
      }
      .chips {
        margin: 28px 0 0;
      }
      .chips p {
        font-size: 14px;
        color: var(--muted);
        margin: 0 0 10px;
      }
      .chips ul {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .chips a {
        display: inline-block;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--mint);
        color: var(--green);
        text-decoration: none;
        font-size: 15px;
        font-weight: 550;
      }
      .chips a:hover {
        background: #dce9da;
      }
      .facts {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 18px;
        margin: 28px 0 0;
        padding: 0;
        list-style: none;
        font-size: 14px;
        color: var(--muted);
      }
      .facts li::before {
        content: '\xB7';
        margin-right: 8px;
        color: #a9b8ae;
      }
      .facts li:first-child::before {
        content: none;
      }
      .sample {
        background: var(--cream);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 18px 48px #193b3412;
      }
      .sample-head {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 12px;
        margin-bottom: 16px;
      }
      .sample-head b {
        display: block;
        font-size: 17px;
      }
      .sample-head span {
        font-size: 14px;
        color: var(--muted);
      }
      .tag {
        font-size: 11px;
        letter-spacing: 0.06em;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--muted);
        border: 1px solid #cfd8d1;
        border-radius: 6px;
        padding: 3px 7px;
        white-space: nowrap;
      }
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .rows li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 11px 14px;
        font-size: 15px;
      }
      .st {
        font-size: 13px;
        font-weight: 650;
        border-radius: 999px;
        padding: 3px 10px;
        white-space: nowrap;
      }
      .st.ok {
        background: var(--mint);
        color: var(--green);
      }
      .st.decl {
        background: var(--amber-bg);
        color: var(--amber);
      }
      .st.unk {
        background: var(--grey-bg);
        color: #55605a;
      }
      .st.bad {
        background: var(--red-bg);
        color: var(--red);
      }
      .ask {
        margin: 14px 0 0;
        font-size: 14px;
        color: #3e564b;
        background: #fff;
        border-left: 3px solid var(--amber);
        padding: 10px 14px;
        border-radius: 0 10px 10px 0;
      }
      .stat {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(240px, 0.8fr);
        gap: 40px;
        align-items: center;
      }
      .stat-text {
        font-size: clamp(22px, 2.4vw, 28px);
        font-weight: 650;
        letter-spacing: -0.03em;
        line-height: 1.2;
        margin: 0;
      }
      .compare {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin: 0;
      }
      .compare p {
        margin: 0;
        background: var(--cream);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px;
      }
      .compare b {
        display: block;
        font-size: 32px;
        letter-spacing: -0.04em;
        line-height: 1;
      }
      .compare span {
        display: block;
        margin-top: 6px;
        font-size: 14px;
        color: #3e564b;
      }
      .why {
        font-size: 18px;
        color: #3e564b;
        margin: 16px 0 0;
        max-width: 36rem;
      }
      .source {
        font-size: 13px;
        color: var(--muted);
        margin: 14px 0 0;
      }
      .steps {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        list-style: none;
        padding: 0;
        margin: 32px 0 0;
        counter-reset: s;
      }
      .steps li {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 22px;
        background: #fff;
        counter-increment: s;
        display: flex;
        flex-direction: column;
      }
      .steps li::before {
        content: counter(s);
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: var(--mint);
        color: var(--green);
        font-weight: 750;
        margin-bottom: 14px;
      }
      .steps p {
        margin: 0;
        color: #3e564b;
        font-size: 16px;
        flex: 1;
      }
      .steps a {
        margin-top: 16px;
        font-weight: 650;
        font-size: 15px;
      }
      .section-lede {
        font-size: 18px;
        color: #3e564b;
        max-width: 40rem;
        margin: 0;
      }
      .legend {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        list-style: none;
        padding: 0;
        margin: 32px 0 0;
      }
      .legend li {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px 18px;
        background: #fff;
      }
      .legend .st {
        display: inline-block;
        margin-bottom: 8px;
      }
      .legend p {
        margin: 0;
        font-size: 15px;
        color: #3e564b;
      }
      .legend li.later {
        background: var(--cream);
        border-style: dashed;
      }
      .legend .soon {
        font-size: 12px;
        color: var(--muted);
        margin-left: 6px;
      }
      .note {
        margin: 24px 0 0;
        font-size: 15px;
        color: #3e564b;
        max-width: 44rem;
      }
      .limits {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px 32px;
        list-style: none;
        padding: 0;
        margin: 24px 0 0;
      }
      .limits li {
        font-size: 15px;
        color: #3e564b;
        padding-left: 18px;
        position: relative;
      }
      .limits li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.6em;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #b8c6bb;
      }
      footer {
        border-top: 1px solid var(--line);
        background: var(--cream);
        font-size: 13px;
        color: var(--muted);
      }
      footer .wrap {
        padding: 28px 24px;
      }
      footer p {
        margin: 4px 0;
      }
      @media (max-width: 860px) {
        .hero,
        .stat,
        .compare {
          grid-template-columns: 1fr;
          gap: 28px;
        }
        .steps {
          grid-template-columns: 1fr;
        }
        .hero {
          padding: 28px 0 0;
        }
      }
      @media (max-width: 640px) {
        header {
          padding: 14px 16px;
        }
        nav {
          gap: 4px;
        }
        .wrap {
          padding: 0 16px;
        }
        section {
          padding: 40px 0;
        }
        .btn {
          flex: 1 1 160px;
        }
        .lede {
          font-size: 18px;
        }
      }
      @media (prefers-reduced-motion: no-preference) {
        .btn,
        .chips a {
          transition:
            background 0.15s,
            border-color 0.15s;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip" href="#main">Aller au contenu</a>
    <header>
      <a class="brand" href="/" aria-label="accescompanion, accueil"
        ><svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
          <rect width="40" height="40" rx="12" fill="#1b5344" />
          <path
            d="M12 29V17.2a8 8 0 0 1 16 0V29"
            fill="none"
            stroke="#f3f6f1"
            stroke-width="2.3"
            stroke-linecap="round"
          />
          <circle cx="20" cy="19.2" r="2.15" fill="#d7ebc8" /></svg
        ><b class="wordmark">acces<i>companion</i></b></a
      >
      <nav aria-label="Navigation principale">
        <a href="/cabinets">Les cabinets</a><a href="/consultation">L\u2019\xE9change</a>
      </nav>
    </header>
    <main id="main">
      <div class="wrap">
        <div class="hero">
          <div>
            <p class="kicker">Paris \xB7 m\xE9decine</p>
            <h1>Voir ce qui est <em>connu</em> avant de r\xE9server.</h1>
            <p class="lede">
              D\xE9crivez votre besoin avec vos mots. accescompanion compare les cabinets sur ce qui
              est document\xE9, montre d\u2019o\xF9 vient chaque information, et dit clairement ce qui reste
              inconnu.
            </p>
            <div class="cta">
              <a class="btn primary" href="/cabinets">Trouver un cabinet</a
              ><a class="btn ghost" href="/consultation">Suivre un rendez-vous</a>
            </div>
            <div class="chips">
              <p id="chips-label">Ou commencez par un besoin :</p>
              <ul aria-labelledby="chips-label">
                <li><a href="/cabinets#besoin=fauteuil">Fauteuil roulant</a></li>
                <li><a href="/cabinets#besoin=audition">Besoin auditif</a></li>
                <li><a href="/cabinets#besoin=vision">Besoin visuel</a></li>
                <li><a href="/cabinets#besoin=sans-marche">Entr\xE9e sans marche</a></li>
              </ul>
            </div>
            <ul class="facts">
              <li>Cabinets m\xE9dicaux \xE0 Paris</li>
              <li>Donn\xE9es Acc\xE8s Libre</li>
              <li>Rien n\u2019est enregistr\xE9</li>
            </ul>
          </div>

          <figure class="sample" aria-labelledby="sample-cap" style="margin: 0">
            <div class="sample-head">
              <div>
                <b id="sample-cap">Les crit\xE8res \xE0 regarder</b
                ><span>Selon les informations de chaque fiche</span>
              </div>
              <span class="tag">Acc\xE8s Libre</span>
            </div>
            <ul class="rows">
              <li>Entr\xE9e sans marche <span class="st decl">Si renseign\xE9e</span></li>
              <li>Largeur de la porte d\u2019entr\xE9e <span class="st decl">Si renseign\xE9e</span></li>
              <li>Trajet jusqu\u2019\xE0 l\u2019accueil <span class="st unk">\xC0 confirmer</span></li>
              <li>\xC9quipement auditif <span class="st unk">\xC0 confirmer</span></li>
              <li>Informations contradictoires <span class="st bad">\xC0 v\xE9rifier</span></li>
            </ul>
            <p class="ask">
              <b>\xC0 demander au cabinet :</b> le trajet jusqu\u2019\xE0 la salle est-il de plain-pied ? Une
              boucle magn\xE9tique est-elle disponible ?
            </p>
          </figure>
        </div>
      </div>

      <section aria-labelledby="stat-h">
        <div class="wrap stat">
          <div>
            <p class="kicker">France \xB7 2022</p>
            <h2 id="stat-h" class="stat-text">
              15 % des personnes handicap\xE9es de 16 \xE0 64 ans ont renonc\xE9 \xE0 des soins.
            </h2>
            <p class="why">
              On r\xE9serve sans savoir si l\u2019entr\xE9e, la porte ou la salle conviendront. Sur place, une
              consigne dite une seule fois peut se perdre.
            </p>
            <p class="source">Source : DREES, 2022.</p>
          </div>
          <div class="compare">
            <p><b>15 %</b><span>Personnes handicap\xE9es</span></p>
            <p><b>7 %</b><span>Ensemble de la population</span></p>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-h">
        <div class="wrap">
          <p class="kicker">Comment \xE7a marche</p>
          <h2 id="how-h">Du choix du cabinet jusqu\u2019\xE0 la consultation.</h2>
          <ol class="steps">
            <li>
              <h3>D\xE9crire et comparer</h3>
              <p>
                \xAB Fauteuil \xE9lectrique, malentendant. \xBB Vos mots deviennent des crit\xE8res que vous
                pouvez relire. Les cabinets sont class\xE9s sur ce qui est document\xE9, les obstacles
                connus en dernier.
              </p>
              <a href="/cabinets">Chercher un cabinet</a>
            </li>
            <li>
              <h3>Pr\xE9parer et r\xE9server</h3>
              <p>
                Une fiche de pr\xE9paration liste les questions \xE0 poser au cabinet. Quand la source
                donne un lien Doctolib, vous r\xE9servez directement.
              </p>
              <a href="/cabinets">Voir les cabinets</a>
            </li>
            <li>
              <h3>Suivre l\u2019\xE9change</h3>
              <p>
                Pendant la visite ou l\u2019appel vid\xE9o, les paroles s\u2019affichent \xE0 l\u2019\xE9cran et vous pouvez
                r\xE9pondre par \xE9crit ou \xE0 voix haute.
              </p>
              <a href="/consultation">Ouvrir l\u2019\xE9change</a>
            </li>
          </ol>
        </div>
      </section>

      <section aria-labelledby="trust-h">
        <div class="wrap">
          <p class="kicker">Confiance</p>
          <h2 id="trust-h">Jamais \xAB accessible \xBB sans preuve.</h2>
          <p class="section-lede">
            Chaque crit\xE8re porte son origine et son anciennet\xE9. Vous voyez jusqu\u2019o\xF9 vous fier \xE0
            chaque r\xE9ponse, au lieu d\u2019un simple oui ou non.
          </p>
          <ul class="legend">
            <li>
              <span class="st decl">D\xE9clar\xE9</span>
              <p>Renseign\xE9 dans Acc\xE8s Libre, sans date de v\xE9rification.</p>
            </li>
            <li>
              <span class="st unk">Inconnu</span>
              <p>Aucune donn\xE9e. Nous ne devinons pas : nous proposons la question \xE0 poser.</p>
            </li>
            <li>
              <span class="st bad">Contradictoire</span>
              <p>Deux champs se contredisent. \xC0 confirmer avec le cabinet.</p>
            </li>
            <li class="later">
              <span class="st ok">V\xE9rifi\xE9</span><span class="soon">\xE0 venir</span>
              <p>Confirm\xE9 par photos du cabinet ou par des patients apr\xE8s leur visite.</p>
            </li>
          </ul>
          <p class="note">
            Aujourd\u2019hui, toutes les informations renseign\xE9es sont <b>d\xE9claratives</b> : l\u2019export
            Acc\xE8s Libre ne donne pas de date de confirmation par fiche. Nous l\u2019affichons tel quel.
          </p>
        </div>
      </section>

      <section aria-labelledby="limits-h">
        <div class="wrap">
          <p class="kicker">Ce que nous ne faisons pas</p>
          <h2 id="limits-h">Un outil d\u2019aide, pas une garantie.</h2>
          <ul class="limits">
            <li>
              Vos besoins sont envoy\xE9s au serveur pour la recherche, sans profil de sant\xE9
              enregistr\xE9.
            </li>
            <li>Pas de cr\xE9neaux ni de r\xE9servation : nous ouvrons le lien Doctolib de la fiche.</li>
            <li>
              Pas un interpr\xE8te ni un dossier m\xE9dical : faites confirmer les consignes importantes.
            </li>
            <li>Pas de score d\u2019accessibilit\xE9 universel : chaque besoin est diff\xE9rent.</li>
          </ul>
        </div>
      </section>
    </main>
    <footer>
      <div class="wrap">
        <p>
          Donn\xE9es : Acc\xE8s Libre \u2014 Minist\xE8re de la Transition \xE9cologique, Licence Ouverte / Etalab
          2.0. Cabinets m\xE9dicaux de Paris, dates de synchronisation indiqu\xE9es dans la recherche.
        </p>
        <p>Statistique : DREES, 2022.</p>
      </div>
    </footer>
  </body>
</html>
`, "searchPage": `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#184c42" />
    <meta
      name="description"
      content="accescompanion aide \xE0 pr\xE9parer un rendez-vous m\xE9dical, \xE0 r\xE9server, puis \xE0 suivre l\u2019\xE9change, quel que soit le handicap."
    />
    <title>accescompanion \u2014 Le rendez-vous, quel que soit le handicap.</title>
    <style>
      :root {
        --ink: #193b34;
        --green: #1f5949;
        --mint: #eaf1e9;
        --cream: #f8f9f5;
        --line: #dfe5dd;
        --muted: #627168;
        --amber: #88601c;
        --red: #9a4234;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--cream);
        color: var(--ink);
        font-family:
          Inter,
          ui-sans-serif,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }
      button,
      input,
      textarea,
      select {
        font: inherit;
      }
      button,
      a,
      input,
      textarea,
      select {
        outline-offset: 4px;
      }
      button:focus-visible,
      a:focus-visible,
      input:focus-visible,
      textarea:focus-visible,
      select:focus-visible {
        outline: 3px solid #b16830;
      }
      button {
        cursor: pointer;
      }
      a {
        color: var(--green);
      }
      .skip {
        position: absolute;
        top: -100px;
      }
      .skip:focus {
        top: 8px;
        left: 16px;
        z-index: 100;
        background: white;
        padding: 12px;
      }
      .shell {
        display: grid;
        grid-template-columns: 230px 1fr;
        min-height: 100vh;
      }
      .sidebar {
        background: #fff;
        border-right: 1px solid var(--line);
        padding: 34px 23px;
        display: flex;
        flex-direction: column;
        position: sticky;
        top: 0;
        height: 100vh;
      }
      .brand {
        display: flex;
        gap: 10px;
        align-items: center;
        font-size: 23px;
        font-weight: 750;
        letter-spacing: -1px;
        text-decoration: none;
        color: var(--ink);
      }
      .logo {
        width: 33px;
        height: 35px;
        border-radius: 10px;
        background: var(--green);
        color: white;
        display: grid;
        place-items: center;
        font-size: 29px;
        line-height: 1;
      }
      .brand small {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1px;
        display: block;
        margin-top: -5px;
        color: var(--muted);
      }
      .navlabel {
        font-size: 10px;
        letter-spacing: 1.5px;
        color: #778379;
        margin: 47px 12px 14px;
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .nav button {
        background: none;
        border: 0;
        text-align: left;
        padding: 12px;
        border-radius: 8px;
        color: #59675e;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 13px;
      }
      .nav button.active {
        color: var(--green);
        background: var(--mint);
        font-weight: 650;
      }
      .nav svg {
        width: 18px;
        height: 18px;
      }
      .sidefoot {
        margin-top: auto;
        border-top: 1px solid var(--line);
        padding-top: 20px;
        font-size: 11px;
        color: var(--muted);
      }
      .sidefoot p {
        margin: 8px 0;
      }
      .privacyicon {
        font-size: 18px;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--line);
        padding: 21px 42px;
        background: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        color: var(--muted);
      }
      .topbar strong {
        color: var(--ink);
        font-weight: 550;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        background: #edf2eb;
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 11px;
        color: var(--green);
      }
      .dot {
        width: 6px;
        height: 6px;
        background: #557a49;
        border-radius: 50%;
      }
      .main {
        max-width: 1300px;
        margin: auto;
        padding: 37px 42px 28px;
      }
      .eyebrow {
        font-size: 10px;
        letter-spacing: 1.7px;
        font-weight: 700;
        color: var(--green);
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 11px;
      }
      .intro {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 25px;
      }
      .intro h1 {
        font-size: clamp(30px, 3.2vw, 43px);
        font-weight: 540;
        letter-spacing: -1.7px;
        line-height: 1.13;
        margin: 0 0 12px;
      }
      .intro h1 em {
        font-family: Georgia, serif;
        color: var(--green);
        font-weight: 400;
      }
      .intro p {
        font-size: 13px;
        color: var(--muted);
        max-width: 600px;
        margin: 0;
        line-height: 1.8;
      }
      .intro-art {
        width: 145px;
        height: 108px;
        flex-shrink: 0;
      }
      .workspace {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 270px;
        gap: 26px;
        margin-top: 28px;
      }
      .search-panel {
        background: white;
        border: 1px solid var(--line);
        border-radius: 13px;
        padding: 23px;
        box-shadow: 0 3px 12px #23372c03;
      }
      .panel-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
      }
      .panel-heading label {
        font-size: 15px;
        font-weight: 650;
        letter-spacing: -0.25px;
      }
      .private {
        font-size: 10px;
        color: var(--muted);
      }
      textarea {
        display: block;
        width: 100%;
        resize: vertical;
        min-height: 84px;
        border: 1px solid #d8e0d7;
        border-radius: 8px;
        padding: 13px;
        background: #fbfcf9;
        color: var(--ink);
        font-size: 13px;
        line-height: 1.7;
      }
      textarea::placeholder {
        color: #7a857c;
      }
      .examples {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin: 12px 0 20px;
      }
      .examples button {
        padding: 5px 9px;
        background: white;
        border: 1px solid var(--line);
        border-radius: 20px;
        font-size: 10px;
        color: #5c6d60;
      }
      .examples button:hover {
        background: var(--mint);
      }
      .search-row {
        display: flex;
        gap: 12px;
        align-items: end;
      }
      .field {
        flex: 1;
        min-width: 0;
      }
      .field label {
        display: block;
        font-size: 10px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      select,
      input[type='number'] {
        border: 1px solid var(--line);
        background: white;
        color: var(--ink);
        border-radius: 7px;
        padding: 10px;
        width: 100%;
        font-size: 12px;
        height: 40px;
      }
      .primary {
        border: 1px solid var(--green);
        background: var(--green);
        color: white;
        border-radius: 7px;
        padding: 10px 17px;
        font-size: 12px;
        font-weight: 600;
        min-height: 40px;
      }
      .primary:hover {
        background: #123c31;
      }
      .search-bottom {
        display: flex;
        gap: 15px;
        margin-top: 13px;
        align-items: center;
        justify-content: space-between;
      }
      .search-bottom small {
        font-size: 10px;
        color: var(--muted);
      }
      #widthField {
        max-width: 135px;
      }
      .results-header {
        margin: 27px 0 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
      }
      .results-header h2 {
        font-size: 16px;
        margin: 0;
        font-weight: 650;
      }
      .results-header small {
        font-size: 10px;
        color: var(--muted);
      }
      #clarification {
        font-size: 12px;
        background: #fff5df;
        color: #755217;
        padding: 11px 13px;
        border-radius: 7px;
        margin-bottom: 13px;
      }
      #clarification:empty {
        display: none;
      }
      .summary {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .summary span {
        font-size: 10px;
        color: var(--green);
        padding: 4px 8px;
        border: 1px solid #cfded0;
        border-radius: 5px;
        background: #f0f6ed;
      }
      .card {
        background: white;
        border: 1px solid var(--line);
        border-radius: 11px;
        padding: 20px;
        margin-bottom: 12px;
        transition: border-color 0.2s;
      }
      .card:hover {
        border-color: #a6bba8;
      }
      .card-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .practice {
        display: flex;
        gap: 12px;
      }
      .avatar {
        height: 40px;
        width: 40px;
        flex-shrink: 0;
        border: 1px solid #dce5d7;
        border-radius: 9px;
        background: #f0f4eb;
        display: grid;
        place-items: center;
        font-family: Georgia, serif;
        font-size: 16px;
        color: var(--green);
      }
      .card h3 {
        font-size: 15px;
        line-height: 1.4;
        margin: 0 0 3px;
        letter-spacing: -0.2px;
      }
      .card .specialty {
        font-size: 10px;
        color: var(--muted);
        margin: 0;
      }
      .address {
        font-size: 11px;
        color: var(--muted);
        margin: 11px 0;
      }
      .status {
        font-size: 9px;
        white-space: nowrap;
        border-radius: 5px;
        padding: 4px 7px;
        height: max-content;
        background: #f9f1df;
        color: var(--amber);
      }
      .status.supported {
        background: #e9f3e5;
        color: #396038;
      }
      .status.obstacle {
        background: #fbeee9;
        color: var(--red);
      }
      .evidence {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 13px 0;
      }
      .check {
        font-size: 10px;
        background: #f4f6f1;
        padding: 5px 8px;
        border-radius: 5px;
        color: #53644e;
      }
      .check.unknown {
        color: var(--amber);
        background: #fbf6eb;
      }
      .check.unmet {
        color: var(--red);
        background: #fbeee9;
      }
      .card-bottom {
        border-top: 1px solid #edf0e9;
        padding-top: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .card-bottom small {
        font-size: 9px;
        color: var(--muted);
      }
      .text-btn {
        border: 0;
        background: none;
        padding: 4px 0;
        font-size: 11px;
        font-weight: 650;
        color: var(--green);
      }
      .card-actions {
        display: flex;
        gap: 15px;
      }
      .linkbutton {
        font-size: 11px;
        text-decoration: none;
        color: var(--green);
        font-weight: 650;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .aside {
        display: flex;
        flex-direction: column;
        gap: 17px;
      }
      .trust-panel {
        background: #eaf0e5;
        border: 1px solid #dce5d4;
        border-radius: 12px;
        padding: 24px 21px;
      }
      .trust-panel h2 {
        font-family: Georgia, serif;
        font-size: 24px;
        font-weight: 400;
        line-height: 1.2;
        letter-spacing: -0.5px;
        margin: 12px 0;
      }
      .trust-panel p {
        font-size: 11px;
        line-height: 1.9;
        color: #586952;
      }
      .trust-list {
        margin-top: 20px;
      }
      .trust-row {
        display: flex;
        gap: 10px;
        margin-top: 15px;
        align-items: start;
      }
      .trust-row .symbol {
        height: 21px;
        width: 21px;
        flex-shrink: 0;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: #dce9d7;
        color: #42663c;
        font-size: 11px;
      }
      .trust-row:nth-child(2) .symbol {
        background: #eee6c9;
        color: #7c6532;
      }
      .trust-row:nth-child(3) .symbol {
        background: #e3e6dd;
        color: #62715c;
      }
      .trust-row b {
        font-size: 11px;
        font-weight: 650;
      }
      .trust-row p {
        margin: 2px 0;
        font-size: 10px;
        line-height: 1.6;
      }
      .note {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 18px 20px;
        background: #fff;
      }
      .note h3 {
        font-size: 12px;
        margin: 0 0 7px;
      }
      .note p {
        font-size: 11px;
        color: var(--muted);
        line-height: 1.8;
        margin: 0 0 9px;
      }
      .note a,
      .note button {
        font-size: 10px;
      }
      .countline {
        font-size: 10px;
        color: var(--muted);
        line-height: 1.8;
        padding: 0 5px;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        gap: 15px;
        border-top: 1px solid var(--line);
        margin-top: 26px;
        padding-top: 16px;
        color: var(--muted);
        font-size: 9px;
      }
      .pager {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: center;
        margin: 20px 0;
        font-size: 11px;
      }
      .pager button {
        background: white;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 7px 12px;
        color: var(--green);
      }
      button:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .empty {
        padding: 35px;
        background: white;
        border: 1px dashed var(--line);
        border-radius: 10px;
        color: var(--muted);
      }
      dialog {
        border: 1px solid var(--line);
        border-radius: 14px;
        width: min(680px, calc(100% - 32px));
        max-height: 85vh;
        padding: 28px;
        color: var(--ink);
        box-shadow: 0 20px 90px #142e3526;
      }
      dialog::backdrop {
        background: #102b2559;
      }
      dialog h2 {
        font-size: 24px;
        letter-spacing: -0.6px;
        margin-top: 12px;
      }
      dialog h3 {
        font-size: 13px;
        margin-top: 23px;
      }
      dialog p,
      dialog li {
        font-size: 12px;
        line-height: 1.8;
      }
      dialog .close {
        float: right;
        background: var(--mint);
        border: 0;
        border-radius: 50%;
        height: 30px;
        width: 30px;
        color: var(--ink);
      }
      .evidence-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        margin: 20px 0;
      }
      .evidence-table td,
      .evidence-table th {
        padding: 10px 6px;
        border-bottom: 1px solid var(--line);
        text-align: left;
      }
      .evidence-table th {
        color: var(--muted);
        font-weight: 500;
      }
      .muted {
        color: var(--muted);
      }
      .callbox {
        background: var(--mint);
        padding: 16px;
        border-radius: 8px;
        margin: 16px 0;
      }
      code {
        background: var(--mint);
        padding: 3px 6px;
        border-radius: 3px;
        overflow-wrap: anywhere;
      }
      pre {
        white-space: pre-wrap;
        background: var(--cream);
        padding: 14px;
        font-size: 11px;
        border: 1px solid var(--line);
        border-radius: 7px;
      }
      body.easy {
        font-size: 17px;
      }
      body.easy .intro p,
      body.easy .note p,
      body.easy .trust-panel p,
      body.easy .card .specialty,
      body.easy .address,
      body.easy .check,
      body.easy .card-bottom small {
        font-size: 14px;
        line-height: 1.9;
      }
      .loading {
        opacity: 0.5;
        pointer-events: none;
      }
      .error {
        color: var(--red);
      }
      @media (min-width: 1500px) {
        .main {
          padding-top: 50px;
        }
        .workspace {
          gap: 35px;
          grid-template-columns: minmax(0, 1fr) 300px;
        }
      }
      @media (max-width: 1150px) {
        .shell {
          grid-template-columns: 190px 1fr;
        }
        .sidebar {
          padding: 28px 17px;
        }
        .brand {
          font-size: 21px;
        }
        .main {
          padding: 30px 25px;
        }
        .topbar {
          padding: 20px 25px;
        }
        .workspace {
          grid-template-columns: minmax(0, 1fr) 230px;
          gap: 18px;
        }
        .search-row {
          flex-wrap: wrap;
        }
        .search-row .primary {
          width: 100%;
        }
        .intro-art {
          width: 110px;
        }
        .private {
          display: none;
        }
        .card-top {
          flex-wrap: wrap;
        }
        .trust-panel {
          padding: 20px 17px;
        }
      }
      @media (max-width: 850px) {
        .shell {
          display: block;
        }
        .sidebar {
          height: auto;
          position: static;
          padding: 17px 20px;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--line);
        }
        .navlabel,
        .sidefoot,
        .brand small {
          display: none;
        }
        .nav {
          flex-direction: row;
        }
        .nav button {
          font-size: 0;
          padding: 10px;
        }
        .nav svg {
          width: 20px;
          height: 20px;
        }
        .topbar {
          padding: 12px 22px;
        }
        .main {
          padding: 30px 22px;
        }
        .workspace {
          grid-template-columns: minmax(0, 1fr) 225px;
        }
        .intro h1 {
          font-size: 34px;
        }
        .intro-art {
          display: none;
        }
      }
      @media (max-width: 650px) {
        .sidebar {
          padding: 15px 17px;
        }
        .brand {
          font-size: 20px;
          gap: 7px;
        }
        .logo {
          width: 28px;
          height: 30px;
          font-size: 25px;
        }
        .nav {
          gap: 1px;
        }
        .nav button {
          padding: 8px;
        }
        .practice {
          min-width: 0;
        }
        .practice h3 {
          overflow-wrap: anywhere;
        }
        .workspace {
          grid-template-columns: 1fr;
        }
        .aside {
          display: grid;
          grid-template-columns: 1fr;
        }
        .trust-panel {
          margin-top: 8px;
        }
        .intro h1 {
          font-size: 34px;
        }
        .topbar .desktop {
          display: none;
        }
        .search-panel {
          padding: 18px;
        }
        .search-row {
          gap: 10px;
        }
        .search-row .field {
          flex-basis: 42%;
        }
        .search-bottom {
          align-items: start;
        }
        .search-bottom small {
          max-width: 55%;
        }
        .main {
          padding: 27px 17px;
        }
        .card {
          padding: 17px;
        }
        .card-bottom {
          align-items: start;
          flex-direction: column;
        }
        .card-actions {
          justify-content: space-between;
          width: 100%;
        }
        .results-header {
          align-items: start;
        }
        .results-header h2 {
          font-size: 15px;
        }
        .footer {
          flex-direction: column;
        }
        .panel-heading label {
          font-size: 14px;
        }
      }
      .appointment-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border: 1px solid #cfddcb;
        background: #eaf1e6;
        border-radius: 10px;
        padding: 17px 20px;
        margin-top: 25px;
      }
      .appointment-banner strong {
        display: block;
        font-size: 13px;
        margin-bottom: 3px;
      }
      .appointment-banner span {
        font-size: 11px;
        color: #52664f;
      }
      .appointment-banner a {
        font-size: 12px;
        font-weight: 650;
        white-space: nowrap;
      }
      @media (max-width: 650px) {
        .appointment-banner {
          flex-direction: column;
          align-items: start;
          padding: 17px;
        }
        .sidebar .nav {
          gap: 0;
        }
        .sidebar .nav button {
          padding: 6px;
        }
        .sidebar .nav svg {
          width: 18px;
          height: 18px;
        }
        .sidebar .brand {
          font-size: 19px;
        }
      }
      .steps {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin: 8px 0 22px;
        padding: 0;
        list-style: none;
      }
      .steps li {
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 14px 16px;
      }
      .steps b {
        display: block;
        margin-bottom: 4px;
      }
      .steps span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }
      a.primary {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
      }
      .card-actions {
        flex-wrap: wrap;
        align-items: center;
      }
      .nobook {
        font-size: 12px;
        color: var(--muted);
      }
      @media (max-width: 800px) {
        .steps {
          grid-template-columns: 1fr;
        }
        .nav button {
          font-size: 14px;
          padding: 8px 12px;
        }
      }
      body {
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        font-size: 16px;
        line-height: 1.5;
        background: #f3f6f1;
        color: #17332c;
      }
      .shell {
        grid-template-columns: 260px 1fr;
      }
      .sidebar {
        padding: 28px 20px;
        border-right-color: #e3ebe4;
      }
      .brand {
        font-size: 20px;
      }
      .brand small,
      .navlabel,
      .sidefoot {
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .sidefoot p {
        font-size: 13px;
        line-height: 1.45;
        letter-spacing: 0;
        text-transform: none;
      }
      .nav button {
        font-size: 15px;
        padding: 12px;
        border-radius: 10px;
      }
      .nav button.active {
        background: #e7f0e6;
      }
      .topbar {
        font-size: 14px;
        padding: 14px 28px;
        background: #fff;
      }
      .main {
        padding: 28px 28px 64px;
      }
      .eyebrow {
        font-size: 12px;
      }
      .intro h1 {
        font-size: 36px;
        letter-spacing: -0.8px;
        line-height: 1.12;
        margin: 0 0 8px;
      }
      .intro p {
        font-size: 17px;
        max-width: 42rem;
        color: #3e564b;
      }
      .steps {
        gap: 14px;
        margin: 18px 0 22px;
      }
      .steps li {
        padding: 16px 18px;
        border-radius: 14px;
        border-color: #e3ebe4;
        box-shadow: 0 8px 24px #193b340a;
        background: #fff;
      }
      .steps b {
        font-size: 15px;
        margin-bottom: 6px;
      }
      .steps span {
        font-size: 14px;
        line-height: 1.45;
      }
      .search-panel,
      .results,
      .card,
      dialog {
        border-color: #e3ebe4;
      }
      .search-panel {
        padding: 20px;
        border-radius: 16px;
        box-shadow: 0 10px 32px #193b340d;
        background: #fff;
      }
      .panel-heading label {
        font-size: 16px;
        font-weight: 700;
        color: #17332c;
      }
      #needs {
        font-size: 16px;
        line-height: 1.5;
        min-height: 108px;
        border-radius: 12px;
        padding: 12px;
      }
      .examples {
        gap: 8px;
        margin-top: 12px;
      }
      .examples button {
        font-size: 14px;
        padding: 8px 12px;
        border-radius: 999px;
      }
      .search-row {
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 14px;
      }
      .search-row .field {
        flex: 1 1 160px;
        min-width: 160px;
      }
      .search-row .primary {
        flex: 1 1 200px;
      }
      .field label {
        font-size: 13px;
        font-weight: 650;
        color: #17332c;
        margin-bottom: 6px;
      }
      select,
      input[type='number'] {
        font-size: 15px;
        min-height: 46px;
        border-radius: 10px;
        padding: 10px 12px;
      }
      .search-row .primary,
      #searchForm .primary,
      a.primary,
      .primary {
        min-height: 44px;
        border-radius: 10px;
        font-size: 15px;
        padding: 11px 16px;
      }
      .filters {
        font-size: 14px;
      }
      .results {
        margin-top: 18px;
      }
      #resultTitle {
        font-size: 22px;
        letter-spacing: -0.3px;
      }
      #summary {
        font-size: 14px;
      }
      .card {
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 8px 24px #193b340a;
      }
      .card h3 {
        font-size: 18px;
      }
      .card .specialty,
      .address,
      .card-bottom small,
      .nobook {
        font-size: 14px;
        line-height: 1.4;
      }
      .avatar {
        width: 42px;
        height: 42px;
        font-size: 14px;
      }
      .status {
        font-size: 12px;
        padding: 5px 8px;
      }
      .check {
        font-size: 13px;
        padding: 6px 8px;
        border-radius: 8px;
      }
      .card-bottom {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid #e3ebe4;
      }
      .card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
        align-items: center;
      }
      .trust-panel h2 {
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        font-size: 20px;
        font-weight: 700;
        line-height: 1.3;
        letter-spacing: -0.3px;
      }
      .trust-panel p,
      .countline {
        font-size: 14px;
        line-height: 1.5;
      }
      .card-actions .linkbutton,
      .card-actions .text-btn,
      .text-btn {
        font-size: 14px;
        min-height: 40px;
      }
      dialog {
        border: 0;
        border-radius: 18px;
        box-shadow: 0 24px 80px #17332c33;
      }
      dialog::backdrop {
        background: #17332c73;
      }
      @media (max-width: 850px) {
        .nav button {
          font-size: 15px;
        }
      }
      @media (max-width: 800px) {
        .main {
          padding: 20px 16px 48px;
        }
        .intro h1 {
          font-size: 30px;
        }
        .card-bottom {
          flex-direction: column;
          align-items: stretch;
        }
        .card-actions {
          justify-content: flex-start;
        }
        .steps {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 520px) {
        .sidebar {
          flex-wrap: wrap;
          padding: 12px;
          gap: 8px;
        }
        .nav {
          flex-wrap: wrap;
        }
        .nav button {
          padding: 8px 10px;
          font-size: 14px;
        }
      }
      .sitehead {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 22px;
        padding: 14px 28px;
        background: rgba(243, 246, 241, 0.94);
        border-bottom: 1px solid #e3ebe4;
        backdrop-filter: blur(12px);
      }
      .sitehead .brand {
        font-size: inherit;
        letter-spacing: 0;
        text-decoration: none;
        gap: 10px;
      }
      .mark {
        width: 38px;
        height: 38px;
        display: block;
        flex: none;
      }
      .wordmark {
        font-weight: 720;
        letter-spacing: -0.065em;
        font-size: 23px;
        line-height: 1;
        color: #17332c;
        background: none;
      }
      .wordmark i {
        font-family: Georgia, 'Iowan Old Style', Palatino, serif;
        font-style: italic;
        font-weight: 520;
        letter-spacing: -0.03em;
        color: #1f5949;
      }
      .sitehead .nav {
        flex-direction: row;
        margin-left: auto;
        gap: 6px;
      }
      .sitehead .nav button {
        font-size: 15px;
        padding: 10px 14px;
        border-radius: 999px;
        color: #3e564b;
      }
      .sitehead .nav button.active {
        background: #e7f0e6;
        color: #1b5344;
      }
      .sitehead .pill {
        flex: none;
      }
      .home {
        max-width: 1120px;
        padding: 8px 24px 72px;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.9fr);
        gap: 36px;
        align-items: center;
        padding: 42px 0 18px;
      }
      .hero h1 {
        font-size: clamp(34px, 4.4vw, 54px);
        line-height: 1.05;
        letter-spacing: -0.045em;
        font-weight: 680;
        margin: 0 0 16px;
        max-width: 16ch;
      }
      .hero-copy p {
        font-size: 18px;
        line-height: 1.5;
        color: #3e564b;
        max-width: 38rem;
      }
      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 22px;
      }
      .hero-actions .primary,
      .ghost {
        min-height: 48px;
        border-radius: 12px;
        padding: 12px 18px;
        font-size: 16px;
        font-weight: 680;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
      }
      .ghost {
        background: #fff;
        color: #1b5344;
        border: 1px solid #d5e0d4;
      }
      .film {
        margin: 0;
      }
      .screen {
        position: relative;
        border-radius: 18px;
        overflow: hidden;
        background: #143f36;
        box-shadow: 0 18px 50px #17332c24;
      }
      .screen svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .shot {
        display: none;
      }
      .film[data-scene='0'] .s0,
      .film[data-scene='1'] .s1,
      .film[data-scene='2'] .s2 {
        display: block;
      }
      .film-play {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: #fff;
        color: #17332c;
        border: 0;
        border-radius: 999px;
        min-height: 48px;
        padding: 12px 18px;
        font-weight: 700;
        box-shadow: 0 8px 24px #0003;
      }
      .film[data-playing='1'] .film-play {
        left: auto;
        right: 14px;
        top: 14px;
        transform: none;
        min-height: 40px;
      }
      .film figcaption {
        margin: 10px 2px 0;
        color: #3e564b;
        font-size: 15px;
        line-height: 1.45;
      }
      .section-head {
        max-width: 40rem;
        margin-bottom: 16px;
      }
      .section-head h2,
      .paths h2,
      .finder-intro h2 {
        font-size: 28px;
        letter-spacing: -0.03em;
        margin: 0 0 8px;
      }
      .section-head p,
      .finder-intro p,
      .paths span,
      .barrier-grid span {
        color: #3e564b;
        font-size: 16px;
        line-height: 1.5;
      }
      .barrier-grid,
      .paths ol {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        list-style: none;
        padding: 0;
        margin: 0 0 28px;
      }
      .paths ol {
        grid-template-columns: repeat(3, 1fr);
        counter-reset: path;
      }
      .barrier-grid li,
      .paths li {
        background: #fff;
        border: 1px solid #e3ebe4;
        border-radius: 16px;
        padding: 18px 16px 16px;
        box-shadow: 0 8px 24px #193b340a;
      }
      .barrier-grid b,
      .paths b {
        display: block;
        margin-bottom: 6px;
        font-size: 16px;
      }
      .paths li {
        counter-increment: path;
      }
      .paths b:before {
        content: counter(path) '. ';
        color: #1f5949;
      }
      #recherche {
        scroll-margin-top: 84px;
        background: #fff;
        border: 1px solid #e3ebe4;
        border-radius: 20px;
        padding: 22px;
        box-shadow: 0 12px 40px #193b340c;
      }
      .finder-intro {
        margin-bottom: 16px;
      }
      .finder-note {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 18px;
        align-items: center;
        margin-top: 8px;
        padding-top: 12px;
        border-top: 1px solid #e3ebe4;
      }
      .finder-note .countline {
        margin: 0;
        flex: 1 1 220px;
      }
      @media (max-width: 900px) {
        .hero,
        .barrier-grid {
          grid-template-columns: 1fr;
        }
        .paths ol {
          grid-template-columns: 1fr;
        }
        .sitehead {
          flex-wrap: wrap;
          padding: 12px 16px;
        }
        .home {
          padding: 8px 16px 56px;
        }
        .hero {
          padding-top: 24px;
        }
        .hero h1 {
          max-width: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .film-play {
          position: static;
          margin: 12px;
        }
      }
      body {
        background: #fff;
      }
      .home {
        max-width: 920px;
      }
      .hero {
        display: block;
        text-align: center;
        padding: 64px 0 0;
      }
      .hero h1 {
        font-size: clamp(34px, 4vw, 46px);
        font-weight: 700;
        letter-spacing: -0.04em;
        line-height: 1.1;
        max-width: 16em;
        margin: 0 auto 8px;
      }
      .hero p {
        font-size: 18px;
        color: #5d6e66;
        margin: 0 auto;
      }
      #recherche {
        background: transparent;
        border: 0;
        box-shadow: none;
        padding: 8px 0 0;
      }
      .search-panel {
        max-width: 720px;
        margin: 28px auto 0;
        padding: 16px;
        border-radius: 16px;
        border: 1px solid #e7eee7;
        box-shadow: 0 10px 32px #17332c12;
      }
      #needs {
        min-height: 72px;
      }
      .quiet {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 8px 22px;
        list-style: none;
        padding: 16px 0 8px;
        margin: 0;
        color: #5d6e66;
        font-size: 14px;
      }
      .quiet a {
        color: #1b5344;
        font-weight: 680;
        text-decoration: none;
      }
      .sitehead {
        background: rgba(255, 255, 255, 0.94);
      }
      @media (max-width: 900px) {
        .hero {
          padding-top: 36px;
        }
      }
    </style>
  </head>
  <body>
    <a href="#main" class="skip">Aller au contenu</a>
    <header class="sitehead">
      <a class="brand" href="/" aria-label="accescompanion, accueil"
        ><svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
          <rect width="40" height="40" rx="12" fill="#1b5344" />
          <path
            d="M12 29V17.2a8 8 0 0 1 16 0V29"
            fill="none"
            stroke="#f3f6f1"
            stroke-width="2.3"
            stroke-linecap="round"
          />
          <circle cx="20" cy="19.2" r="2.15" fill="#d7ebc8" /></svg
        ><b class="wordmark">acces<i>companion</i></b></a
      >
      <nav class="nav" aria-label="Navigation principale">
        <button id="navSearch" class="active" title="Trouver un cabinet" type="button">
          Trouver un cabinet</button
        ><button id="navConsultation" title="Pendant le rendez-vous" type="button">
          L\u2019\xE9change
        </button>
      </nav>
      <span class="pill"><span class="dot"></span>Paris \xB7 pilote</span>
    </header>
    <main class="main home" id="main">
      <section class="hero">
        <h1>Trouver un cabinet.</h1>
        <p>Seulement ce qui est document\xE9.</p>
      </section>
      <section id="recherche" aria-label="Recherche et r\xE9sultats">
        <form id="searchForm" class="search-panel">
          <div class="panel-heading">
            <label for="needs">Votre besoin</label
            ><span class="private">\u2667 &nbsp; Session priv\xE9e</span>
          </div>
          <textarea
            id="needs"
            name="needs"
            maxlength="2000"
            placeholder="Par exemple : je me d\xE9place en fauteuil \xE9lectrique et je suis malentendant\u2026"
          >
Je me d\xE9place en fauteuil \xE9lectrique et je suis malentendant.</textarea>
          <div class="examples" aria-label="Exemples de besoins">
            <button type="button" data-example="Je me d\xE9place en fauteuil roulant.">
              \u267F Fauteuil roulant</button
            ><button type="button" data-example="Je suis malentendant.">\u25D6 Besoin auditif</button
            ><button type="button" data-example="Je suis malvoyant.">\u25CE Besoin visuel</button
            ><button
              type="button"
              data-example="J\u2019ai besoin d\u2019une entr\xE9e sans marche et de sanitaires adapt\xE9s."
            >
              \u2197 Sans marche
            </button>
          </div>
          <div class="search-row">
            <div class="field">
              <label for="district">O\xF9 cherchez-vous ?</label
              ><select id="district">
                <option value="">Tout Paris</option>
              </select>
            </div>
            <div class="field">
              <label for="specialty">Type de professionnel</label
              ><select id="specialty">
                <option value="">Toutes les sp\xE9cialit\xE9s</option>
              </select>
            </div>
            <div class="field" id="widthField">
              <label for="width">Passage requis (cm)</label
              ><input
                id="width"
                type="number"
                min="40"
                max="200"
                placeholder="\xC0 pr\xE9ciser"
                aria-describedby="widthHelp"
              />
            </div>
            <button class="primary" id="searchButton" type="submit">
              Trouver un cabinet &nbsp; \u2197
            </button>
          </div>
          <div class="search-bottom">
            <small id="widthHelp"
              >La largeur d\xE9pend de vos besoins. Aucun seuil n\u2019est suppos\xE9.</small
            ><button class="text-btn" id="reset" type="button">Effacer mes besoins</button>
          </div>
        </form>
        <ul class="quiet">
          <li>Le lieu, s\u2019il est document\xE9</li>
          <li>La r\xE9servation sur Doctolib</li>
          <li><a href="/consultation">Suivre l\u2019\xE9change</a></li>
        </ul>
        <div class="results-header">
          <div>
            <h2 id="resultTitle">Les cabinets \xE0 explorer</h2>
            <small id="resultSubtitle">Selon les informations disponibles</small>
          </div>
        </div>
        <div id="clarification" role="status"></div>
        <div class="summary" id="summary"></div>
        <div id="results" aria-live="polite" aria-busy="false"></div>
        <div class="pager" id="pager"></div>
      </section>
      <div class="finder-note">
        <button class="text-btn" id="easy" aria-pressed="false" type="button">
          Activer la lecture agrandie &nbsp; Aa
        </button>
        <p class="countline" id="datasetCount">Chargement des donn\xE9es publiques\u2026</p>
        <button class="text-btn" id="learnTrust" type="button">Sources des fiches</button>
      </div>
      <footer class="footer">
        <span>accescompanion \xB7 pr\xE9parer la visite, r\xE9server, suivre l\u2019\xE9change.</span
        ><span
          >Donn\xE9es : Acc\xE8s Libre \xB7 Licence Ouverte 2.0 \xB7 Dates de synchronisation dans les
          r\xE9sultats</span
        >
      </footer>
    </main>
    <dialog id="dialog" aria-labelledby="dialogTitle">
      <button class="close" id="closeDialog" aria-label="Fermer la fen\xEAtre">\xD7</button>
      <div id="dialogContent"></div>
    </dialog>
    <script>
      (() => {
  // src/search.js
  var $ = (id) => document.getElementById(id);
  var response = null;
  var page = 0;
  var lastInput = null;
  var activeController = null;
  var catalogData = null;
  var size = 6;
  function displayDate(value) {
    return value ? new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "date inconnue";
  }
  var esc = (s) => String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
  var safeLink = (s, hosts) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" && hosts.includes(u.hostname) && !u.username && !u.password ? u.href : null;
    } catch {
      return null;
    }
  };
  var states = {
    declared: "D\\xE9clar\\xE9 \\xB7 date de confirmation inconnue",
    unknown: "Non renseign\\xE9",
    stale: "Information ancienne",
    contradictory: "Sources contradictoires",
    photo: "Appuy\\xE9 par une photo",
    patient: "Confirm\\xE9 par un patient"
  };
  var labels = {
    stepFree: "Entr\\xE9e sans marche",
    route: "Trajet jusqu\\u2019\\xE0 l\\u2019accueil",
    width: "Largeur de la porte d\\u2019entr\\xE9e",
    hearing: "\\xC9quipement auditif",
    toilets: "Sanitaires adapt\\xE9s",
    consultation: "Salle de consultation",
    signage: "Signal\\xE9tique int\\xE9rieure"
  };
  function input() {
    return {
      needs: $("needs").value,
      district: $("district").value,
      specialty: $("specialty").value,
      ...$("width").value ? { width: Number($("width").value) } : {}
    };
  }
  async function api(path, body, signal) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Service indisponible.");
    return data;
  }
  async function search(requestedPage = 0, reuseFilters = false) {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    lastInput = {
      ...reuseFilters && lastInput ? lastInput : input(),
      page: requestedPage + 1,
      pageSize: size
    };
    $("results").setAttribute("aria-busy", "true");
    $("searchButton").disabled = true;
    $("searchButton").textContent = "Recherche\\u2026";
    try {
      response = await api("/api/search", lastInput, controller.signal);
      page = response.page - 1;
      render();
    } catch (e) {
      if (e.name !== "AbortError") {
        $("results").innerHTML = '<div class="empty error">' + esc(e.message) + " R\\xE9essayez avec le bouton de recherche.</div>";
        $("pager").innerHTML = "";
        $("resultTitle").textContent = "Recherche indisponible";
        $("clarification").textContent = "";
        $("summary").innerHTML = "";
        response = null;
      }
    } finally {
      if (activeController === controller) {
        $("results").setAttribute("aria-busy", "false");
        $("searchButton").disabled = false;
        $("searchButton").innerHTML = "Trouver un cabinet &nbsp; \\u2197";
      }
    }
  }
  function render() {
    const data = response.results;
    const start = page * size;
    $("resultTitle").textContent = response.total + " cabinet" + (response.total > 1 ? "s" : "") + " \\xE0 explorer";
    $("resultSubtitle").textContent = "Acc\\xE8s Libre \\xB7 export du " + displayDate(response.dataset.exportedAt) + " \\xB7 import\\xE9 le " + displayDate(response.dataset.importedAt);
    $("clarification").textContent = [
      response.needs.clarification,
      catalogData?.dataset.stale ? "La derni\\xE8re synchronisation date de plus de trois jours." : ""
    ].filter(Boolean).join(" ");
    $("summary").innerHTML = response.needs.keys.map((k) => "<span>" + esc(labels[k]) + "</span>").join("");
    $("results").innerHTML = data.length ? data.map((p) => {
      const booking = safeLink(p.doctolibUrl, ["www.doctolib.fr", "doctolib.fr"]);
      const initials = p.name.split(/\\s+/).slice(0, 2).map((x) => x[0]).join("");
      return '<article class="card"><div class="card-top"><div class="practice"><div class="avatar" aria-hidden="true">' + esc(initials) + "</div><div><h3>" + esc(p.name) + '</h3><p class="specialty">' + esc(p.specialty) + '</p></div></div><span class="status ' + p.category + '">' + (p.category === "obstacle" ? "Obstacle connu" : p.category === "supported" ? "Crit\\xE8res renseign\\xE9s" : p.category === "unassessed" ? "Besoins \\xE0 pr\\xE9ciser" : "\\xC0 confirmer") + '</span></div><p class="address">' + esc(p.address) + '</p><div class="evidence">' + p.checks.map(
        (c) => '<span class="check ' + c.fit + '">' + (c.fit === "met" ? "Correspond : " : c.fit === "unmet" ? "Ne correspond pas : " : "\\xC0 confirmer : ") + esc(labels[c.key]) + (c.key === "width" && c.value !== null ? " \\xB7 " + esc(c.value) + " cm" : "") + "</span>"
      ).join("") + '</div><div class="card-bottom"><small>' + esc(p.source) + (p.mode === "real" ? " \\xB7 " + p.met + " crit\\xE8re(s) correspondant(s) / " + p.checks.length : " \\xB7 Ne pas utiliser pour une visite r\\xE9elle") + '</small><div class="card-actions">' + (booking ? '<a class="primary" href="' + esc(booking) + '" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Doctolib pour ' + esc(p.name) + ' (nouvel onglet)">Prendre rendez-vous</a>' : '<span class="nobook">Pas de lien Doctolib</span>') + '<a class="linkbutton" href="/consultation?practice=' + encodeURIComponent(p.id) + '">Suivre l\\u2019\\xE9change</a><button class="text-btn detail" data-id="' + esc(p.id) + '">Voir les preuves \\u2197</button></div></div></article>';
    }).join("") : '<div class="empty">Aucun \\xE9tablissement dans cet \\xE9chantillon pour ces filtres. Essayez tout Paris ou une autre sp\\xE9cialit\\xE9.</div>';
    $("pager").innerHTML = response.total > size ? '<button id="prev" ' + (page === 0 ? "disabled" : "") + ">\\u2190 Pr\\xE9c\\xE9dent</button><span>" + (start + 1) + "\\u2013" + Math.min(start + size, response.total) + " sur " + response.total + '</span><button id="next" ' + (start + size >= response.total ? "disabled" : "") + ">Suivant \\u2192</button>" : "";
    if ($("prev"))
      $("prev").onclick = () => {
        search(page - 1, true).then(
          () => $("resultTitle").scrollIntoView({ block: "start", behavior: "smooth" })
        );
      };
    if ($("next"))
      $("next").onclick = () => {
        search(page + 1, true).then(
          () => $("resultTitle").scrollIntoView({ block: "start", behavior: "smooth" })
        );
      };
  }
  function modal(content) {
    $("dialogContent").innerHTML = content;
    $("dialog").showModal();
  }
  async function detail(id) {
    const p = response?.results.find((p2) => p2.id === id);
    if (!p) return;
    const source = safeLink(p.sourceUrl, ["acceslibre.beta.gouv.fr"]);
    const booking = safeLink(p.doctolibUrl, ["www.doctolib.fr", "doctolib.fr"]);
    modal(
      '<div class="eyebrow">VOTRE FICHE D\\u2019ACCESSIBILIT\\xC9</div><h2 id="dialogTitle">' + esc(p.name) + '</h2><p class="muted">' + esc(p.address) + "</p><p>" + esc(
        "Informations d\\xE9claratives Acc\\xE8s Libre. La date de confirmation individuelle n\\u2019est pas fournie dans cet export."
      ) + '</p><table class="evidence-table"><thead><tr><th>Crit\\xE8re demand\\xE9</th><th>Information</th><th>Confiance</th></tr></thead><tbody>' + p.checks.map(
        (c) => "<tr><td>" + esc(labels[c.key]) + "</td><td>" + esc(
          c.value === null ? "Inconnu" : typeof c.value === "boolean" ? c.value ? "Oui" : "Non" : c.value + " cm"
        ) + "</td><td>" + esc(states[c.state]) + "</td></tr>"
      ).join("") + '</tbody></table><p class="muted">Une porte assez large ou une entr\\xE9e sans marche ne garantit pas l\\u2019acc\\xE8s \\xE0 l\\u2019ensemble du cabinet. Le mat\\xE9riel et l\\u2019aide au transfert restent \\xE0 confirmer.</p>' + (source ? '<p><a target="_blank" rel="noopener noreferrer" href="' + esc(source) + '">Consulter la fiche Acc\\xE8s Libre \\u2197</a></p>' : "") + (booking ? '<p><a class="primary" href="' + esc(booking) + '" target="_blank" rel="noopener noreferrer">Prendre rendez-vous sur Doctolib</a></p>' : '<p class="nobook">Aucun lien Doctolib n\\u2019est indiqu\\xE9 pour ce cabinet.</p>') + '<div class="card-actions"><button class="primary" id="makeBrief">Pr\\xE9parer ma visite \\u2197</button><a class="linkbutton" href="/consultation?practice=' + encodeURIComponent(p.id) + '" aria-label="Compagnon de ce rendez-vous">Suivre l\\u2019\\xE9change</a></div><div id="brief"></div>'
    );
    $("makeBrief").onclick = async () => {
      const b = $("makeBrief");
      b.disabled = true;
      try {
        const r = await api("/api/briefing", { ...lastInput, id });
        $("brief").innerHTML = '<div class="callbox"><h3>Votre script pour appeler le cabinet</h3><p>' + esc(r.script) + "</p><ul>" + r.questions.map((q) => "<li>" + esc(q) + "</li>").join("") + '<li>Mon mat\\xE9riel et mes besoins de transfert permettent-ils la consultation dans votre cabinet ?</li></ul><p>Les modalit\\xE9s de stationnement et le trajet depuis la rue restent \\xE0 confirmer.</p></div><button class="text-btn" id="copyBrief">Copier ma pr\\xE9paration</button><span id="copyStatus" role="status"></span>';
        $("copyBrief").onclick = async () => {
          try {
            await navigator.clipboard.writeText(
              r.name + "\\n" + r.address + "\\n\\n" + r.script + "\\n" + [
                ...r.questions,
                "Mon mat\\xE9riel et mes besoins de transfert permettent-ils la consultation ?",
                "Quelles sont les modalit\\xE9s de stationnement et d\\u2019acc\\xE8s depuis la rue ?"
              ].map((q) => "\\u2022 " + q).join("\\n")
            );
            $("copyStatus").textContent = " Copi\\xE9.";
          } catch {
            $("copyStatus").textContent = " Copie indisponible. S\\xE9lectionnez le texte ci-dessus.";
          }
        };
      } catch (e) {
        $("brief").textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
  }
  function trust() {
    modal(
      '<div class="eyebrow">LA TRANSPARENCE D\\u2019ABORD</div><h2 id="dialogTitle">Ce que les donn\\xE9es nous disent.</h2><p>Nous utilisons un extrait de l\\u2019export public Acc\\xE8s Libre : les cabinets m\\xE9dicaux parisiens import\\xE9s dans la base. La source est collaborative et ses informations ne constituent pas une garantie d\\u2019acc\\xE8s.</p><h3>Une date d\\u2019export n\\u2019est pas une date de v\\xE9rification</h3><p>Le fichier ne fournit pas les dates de confirmation individuelles ni les identit\\xE9s des contributeurs. Les crit\\xE8res renseign\\xE9s sont donc marqu\\xE9s \\xAB d\\xE9clar\\xE9s \\xBB. Aucun n\\u2019est pr\\xE9sent\\xE9 comme v\\xE9rifi\\xE9 par une photo ou confirm\\xE9 par un patient.</p><h3>Comment fonctionne le classement ?</h3><p>Les crit\\xE8res correspondant \\xE0 vos besoins et renseign\\xE9s positivement passent en premier. Les obstacles connus passent en dernier. Les informations manquantes ou contradictoires restent \\xE0 confirmer. Nous ne calculons ni distance, ni temps de trajet, ni disponibilit\\xE9 de rendez-vous.</p><h3>Vos besoins restent temporaires</h3><p>Le texte est trait\\xE9 par des r\\xE8gles explicites sur notre serveur, sans mod\\xE8le IA, sans compte et sans enregistrement dans une base de donn\\xE9es. Il est envoy\\xE9 dans le corps de la requ\\xEAte, jamais dans l\\u2019adresse de la page. Vous pouvez l\\u2019effacer \\xE0 tout moment.</p><p>Le compagnon de rendez-vous propose des sous-titres selon le navigateur, des messages parl\\xE9s et des notes \\xE0 relire. La v\\xE9rification par photos et les retours de patients restent \\xE0 d\\xE9velopper.</p><p><a href="https://www.data.gouv.fr/datasets/acceslibre/" target="_blank" rel="noopener noreferrer">Source : Acc\\xE8s Libre \\u2014 Minist\\xE8re de la Transition \\xE9cologique \\u2197</a><br>Licence Ouverte / Etalab 2.0. Dates d\\u2019export et de synchronisation disponibles dans les r\\xE9sultats.</p>'
    );
  }
  $("searchForm").onsubmit = (e) => {
    e.preventDefault();
    search();
  };
  document.querySelectorAll("[data-example]").forEach(
    (b) => b.onclick = () => {
      $("needs").value = b.dataset.example;
      $("needs").focus();
    }
  );
  $("reset").onclick = () => {
    activeController?.abort();
    $("needs").value = "";
    $("width").value = "";
    lastInput = null;
    response = null;
    $("results").innerHTML = '<div class="empty">Vos besoins ont \\xE9t\\xE9 effac\\xE9s. D\\xE9crivez un nouveau besoin pour commencer.</div>';
    $("pager").innerHTML = "";
    $("summary").innerHTML = "";
    $("clarification").textContent = "";
    $("resultTitle").textContent = "Une nouvelle recherche";
    $("resultSubtitle").textContent = "Aucun besoin conserv\\xE9";
    $("dialogContent").innerHTML = "";
    $("dialog").close();
    $("needs").focus();
  };
  $("results").onclick = (e) => {
    const b = e.target.closest(".detail");
    if (b) detail(b.dataset.id);
  };
  $("closeDialog").onclick = () => $("dialog").close();
  $("dialog").addEventListener("click", (e) => {
    if (e.target === $("dialog")) {
      const r = $("dialog").getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        $("dialog").close();
    }
  });
  $("navConsultation").onclick = () => location.assign("/consultation");
  $("learnTrust").onclick = trust;
  $("navSearch").onclick = () => {
    $("recherche").scrollIntoView({ behavior: "smooth", block: "start" });
    $("needs").focus();
  };
  $("easy").onclick = () => {
    const on = document.body.classList.toggle("easy");
    $("easy").setAttribute("aria-pressed", String(on));
    $("easy").textContent = on ? "Revenir \\xE0 la taille standard Aa" : "Activer la lecture agrandie Aa";
  };
  (async () => {
    try {
      const r = await fetch("/api/catalog");
      if (!r.ok) throw new Error();
      const d = await r.json();
      catalogData = d;
      for (const zip of d.districts) {
        const o = document.createElement("option");
        o.value = zip;
        o.textContent = "Paris " + Number(zip.slice(3)) + (zip.endsWith("01") ? "er" : "e") + " \\xB7 " + zip;
        $("district").append(o);
      }
      for (const s of d.specialties) {
        const o = document.createElement("option");
        o.value = s;
        o.textContent = s;
        $("specialty").append(o);
      }
      $("datasetCount").textContent = d.count + " \\xE9tablissements m\\xE9dicaux \\xE0 Paris. Acc\\xE8s Libre \\xB7 export du " + displayDate(d.dataset.exportedAt) + " \\xB7 synchronis\\xE9 le " + displayDate(d.dataset.lastCheckedAt || d.dataset.importedAt) + ". Dates de v\\xE9rification individuelles non disponibles.";
      await search();
    } catch {
      $("results").innerHTML = '<div class="empty error">Les donn\\xE9es sont indisponibles. Rechargez la page pour r\\xE9essayer.</div>';
    }
  })();
  {
    const k = (location.hash.match(/^#besoin=([a-z-]+)$/) || [])[1];
    const t = {
      fauteuil: "Je me d\\xE9place en fauteuil roulant.",
      audition: "Je suis malentendant.",
      vision: "Je suis malvoyant.",
      "sans-marche": "J\\u2019ai besoin d\\u2019une entr\\xE9e sans marche et de sanitaires adapt\\xE9s."
    }[k];
    if (t) {
      $("needs").value = t;
      history.replaceState(null, "", location.pathname);
      $("needs").focus();
    }
  }
})();

    <\/script>
  </body>
</html>
`, "consultationPage": `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#1f5949" />
    <title>accescompanion \u2014 L\u2019\xE9change</title>
    <meta
      name="description"
      content="Un espace de communication pendant votre consultation : sous-titres, r\xE9ponses \xE9crites et lecture vocale."
    />
    <style>
      :root {
        --ink: #193b34;
        --green: #1f5949;
        --mint: #eaf1e9;
        --cream: #f8f9f5;
        --line: #dfe5dd;
        --muted: #596c60;
        --amber: #785118;
      }
      * {
        box-sizing: border-box;
      }
      [hidden] {
        display: none !important;
      }
      body {
        margin: 0;
        background: var(--cream);
        color: var(--ink);
        font:
          14px/1.6 Inter,
          ui-sans-serif,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
      }
      button,
      input,
      select,
      textarea {
        font: inherit;
      }
      button,
      a,
      input,
      textarea,
      select {
        outline-offset: 4px;
      }
      *:focus-visible {
        outline: 3px solid #ad6834;
      }
      button {
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      a {
        color: var(--green);
      }
      .skip {
        position: absolute;
        top: -100px;
      }
      .skip:focus {
        top: 8px;
        left: 12px;
        z-index: 5;
        background: white;
        padding: 12px;
      }
      header {
        background: white;
        border-bottom: 1px solid var(--line);
        padding: 19px max(25px, calc((100vw - 1280px) / 2));
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }
      .brand {
        font-size: 23px;
        font-weight: 750;
        letter-spacing: -1px;
        color: var(--ink);
        text-decoration: none;
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .brand span {
        background: var(--green);
        color: white;
        border-radius: 9px;
        width: 32px;
        height: 34px;
        display: grid;
        place-items: center;
        font-size: 27px;
      }
      .header-right {
        display: flex;
        align-items: center;
        gap: 24px;
        font-size: 12px;
      }
      .badge {
        font-size: 11px;
        border-radius: 20px;
        padding: 5px 11px;
        background: var(--mint);
        color: var(--green);
      }
      main {
        max-width: 1330px;
        margin: auto;
        padding: 35px 25px;
      }
      .eyebrow {
        font-size: 10px;
        letter-spacing: 1.5px;
        font-weight: 700;
        color: var(--green);
        margin: 0 0 8px;
      }
      .intro {
        display: flex;
        justify-content: space-between;
        gap: 22px;
        align-items: center;
      }
      .intro h1 {
        font-size: clamp(30px, 3.5vw, 43px);
        line-height: 1.2;
        letter-spacing: -1.4px;
        font-weight: 550;
        margin: 0 0 12px;
      }
      .intro h1 em {
        font-family: Georgia, serif;
        font-weight: 400;
      }
      .intro p {
        color: var(--muted);
        font-size: 13px;
        margin: 0;
      }
      .guide {
        background: white;
        border: 1px solid var(--line);
        border-radius: 7px;
        padding: 10px 14px;
        color: var(--green);
        font-size: 12px;
        flex-shrink: 0;
      }
      .modes {
        display: flex;
        gap: 10px;
        margin: 25px 0 22px;
        flex-wrap: wrap;
      }
      .mode {
        border: 1px solid var(--line);
        border-radius: 9px;
        background: white;
        text-align: left;
        color: var(--ink);
        padding: 11px 16px;
        min-width: 180px;
      }
      .mode[aria-pressed='true'] {
        border-color: #638b6e;
        background: var(--mint);
      }
      .mode b {
        font-size: 12px;
        display: block;
      }
      .mode span {
        font-size: 11px;
        color: var(--muted);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 330px;
        gap: 22px;
      }
      .conversation {
        border: 1px solid var(--line);
        border-radius: 13px;
        background: white;
        overflow: hidden;
      }
      .toolbar {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid var(--line);
      }
      .toolbar h2 {
        font-size: 14px;
        margin: 0;
      }
      .mic-status {
        font-size: 11px;
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .indicator {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #89988a;
      }
      .recording .indicator {
        background: #b23e2b;
        box-shadow: 0 0 0 4px #f8e7df;
      }
      .recording {
        color: #9a3425;
      }
      .captions-wrap {
        height: 420px;
        overflow: auto;
        scroll-behavior: smooth;
        padding: 24px;
      }
      .empty {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        padding: 20px;
      }
      .empty svg {
        width: 100px;
        height: 80px;
      }
      .empty h3 {
        font:
          400 28px/1.2 Georgia,
          serif;
        letter-spacing: -0.7px;
        margin: 17px 0 8px;
      }
      .empty p {
        font-size: 12px;
        color: var(--muted);
        max-width: 330px;
        margin: 0 0 15px;
      }
      .subtle {
        background: none;
        border: 0;
        color: var(--green);
        font-size: 12px;
        padding: 4px 0;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .message {
        max-width: 95%;
        padding: 14px 17px;
        border: 1px solid var(--line);
        border-radius: 10px;
        margin-bottom: 13px;
        background: #f7f9f4;
      }
      .message.patient {
        margin-left: auto;
        background: #eaf1e7;
        border-color: #d6e2d0;
      }
      .message .meta {
        font-size: 10px;
        color: var(--muted);
        display: flex;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 5px;
      }
      .message p {
        font-size: 22px;
        line-height: 1.55;
        margin: 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .message .edit {
        border: 0;
        background: none;
        font-size: 10px;
        color: var(--green);
        padding: 0;
        text-decoration: underline;
      }
      .interim {
        font-size: 22px;
        line-height: 1.55;
        color: #687465;
        padding: 5px 16px 14px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .caption-controls {
        padding: 16px 20px;
        border-top: 1px solid var(--line);
        background: #fcfdf9;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .primary {
        background: var(--green);
        border: 1px solid var(--green);
        color: white;
        border-radius: 7px;
        padding: 11px 15px;
        font-weight: 600;
        font-size: 12px;
      }
      .secondary {
        background: white;
        border: 1px solid var(--line);
        color: var(--green);
        border-radius: 7px;
        padding: 10px 13px;
        font-size: 12px;
      }
      .caption-controls .subtle {
        margin-left: auto;
        font-size: 11px;
      }
      .notice {
        font-size: 11px;
        line-height: 1.8;
        color: var(--muted);
        margin: 12px 3px;
      }
      .notice strong {
        color: var(--ink);
      }
      .panel {
        background: white;
        border: 1px solid var(--line);
        border-radius: 11px;
        padding: 20px;
        margin-bottom: 16px;
      }
      .panel h2 {
        font-size: 14px;
        margin: 0 0 6px;
      }
      .panel p {
        font-size: 11px;
        color: var(--muted);
        line-height: 1.8;
        margin: 0 0 14px;
      }
      .panel label,
      .panel legend {
        font-size: 11px;
        color: var(--muted);
      }
      .panel select,
      textarea {
        width: 100%;
        border: 1px solid #d8e0d7;
        border-radius: 7px;
        background: #fbfcf9;
        color: var(--ink);
        padding: 10px;
        font-size: 13px;
      }
      .panel select {
        margin: 5px 0 10px;
      }
      .panel textarea {
        display: block;
        min-height: 100px;
        resize: vertical;
        line-height: 1.7;
      }
      .row {
        display: flex;
        gap: 9px;
        flex-wrap: wrap;
        margin-top: 11px;
      }
      .check-label {
        display: flex;
        align-items: start;
        gap: 9px;
        margin: 11px 0;
      }
      .check-label input {
        margin-top: 4px;
        accent-color: var(--green);
        flex-shrink: 0;
      }
      .check-label span {
        font-size: 11px;
        line-height: 1.7;
      }
      .status {
        font-size: 12px;
        line-height: 1.7;
        background: #edf3e8;
        border: 1px solid #d8e4d1;
        border-radius: 7px;
        padding: 10px 13px;
        margin: 0 0 15px;
        overflow-wrap: anywhere;
      }
      .status.error {
        background: #fdf1e9;
        border-color: #ecd6c4;
        color: #8a4428;
      }
      .quick {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: 10px 0;
      }
      .quick button {
        background: white;
        border: 1px solid var(--line);
        color: var(--green);
        border-radius: 16px;
        padding: 6px 9px;
        font-size: 10px;
      }
      .composer-controls {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .composer-controls button {
        flex: 1;
      }
      .settings {
        background: #edf2e8;
      }
      .settings fieldset {
        border: 0;
        padding: 0;
        margin: 0;
      }
      .settings .helper {
        font-size: 10px;
      }
      .tabs {
        display: flex;
        gap: 20px;
        border-bottom: 1px solid var(--line);
        margin: 5px 0 20px;
      }
      .tabs button {
        border: 0;
        background: none;
        padding: 10px 2px;
        color: var(--muted);
        font-size: 13px;
      }
      .tabs button[aria-selected='true'] {
        color: var(--green);
        border-bottom: 2px solid var(--green);
        font-weight: 650;
      }
      .notes-panel {
        background: white;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 23px;
      }
      .notes-panel h2 {
        font-size: 18px;
        margin-top: 0;
      }
      .notes-panel p {
        font-size: 12px;
        color: var(--muted);
      }
      #notes {
        min-height: 270px;
        font-size: 16px;
        line-height: 1.8;
        margin-top: 7px;
      }
      .notes-panel .check-label span {
        font-size: 12px;
      }
      .footer {
        font-size: 10px;
        color: var(--muted);
        margin-top: 25px;
        border-top: 1px solid var(--line);
        padding-top: 16px;
        display: flex;
        gap: 15px;
        justify-content: space-between;
      }
      .vision .message p,
      .vision .interim {
        font-size: 30px;
      }
      .vision .panel p,
      .vision .notice,
      .vision .panel label,
      .vision .check-label span,
      .vision .intro p {
        font-size: 16px;
      }
      .vision button,
      .vision .panel select {
        font-size: 15px;
      }
      .vision .layout {
        grid-template-columns: minmax(0, 1fr) 370px;
      }
      .vision .message .meta {
        font-size: 13px;
      }
      dialog {
        border: 1px solid var(--line);
        border-radius: 12px;
        width: min(580px, calc(100% - 30px));
        padding: 25px;
        color: var(--ink);
        box-shadow: 0 20px 80px #142e3526;
      }
      dialog::backdrop {
        background: #16392a66;
      }
      dialog textarea {
        min-height: 160px;
      }
      dialog h2 {
        font-size: 20px;
        margin: 0 0 12px;
      }
      dialog p {
        font-size: 12px;
        color: var(--muted);
      }
      .demo-label {
        color: #845d19;
        background: #fbf2dc;
        padding: 5px 9px;
        border-radius: 5px;
        font-size: 10px;
      }
      .demo-label:empty {
        display: none;
      }
      .danger {
        color: #994432;
      }
      .speech-status {
        min-height: 18px;
        font-size: 11px;
        color: var(--muted);
        margin-top: 10px;
      }
      .tts-active {
        color: var(--green);
      }
      @media (max-width: 900px) {
        .layout,
        .vision .layout {
          grid-template-columns: minmax(0, 1fr) 290px;
        }
        .intro {
          align-items: start;
        }
        .intro h1 {
          font-size: 33px;
        }
        .modes .mode {
          flex: 1;
          min-width: 140px;
        }
        .captions-wrap {
          height: 400px;
        }
      }
      @media (max-width: 680px) {
        header {
          padding: 15px 18px;
        }
        .brand {
          font-size: 20px;
        }
        .header-right {
          gap: 12px;
        }
        .header-right .badge {
          display: none;
        }
        main {
          padding: 25px 17px;
        }
        .layout,
        .vision .layout {
          grid-template-columns: 1fr;
        }
        .intro {
          flex-direction: column;
          gap: 15px;
        }
        .intro h1 {
          font-size: 32px;
        }
        .modes {
          gap: 7px;
        }
        .mode {
          padding: 10px;
          min-width: 0 !important;
          flex-basis: 30% !important;
        }
        .mode b {
          font-size: 11px;
        }
        .mode span {
          font-size: 10px;
        }
        .captions-wrap {
          height: 350px;
          padding: 17px;
        }
        .caption-controls {
          padding: 14px;
        }
        .caption-controls .subtle {
          width: 100%;
          text-align: left;
          margin-left: 0;
        }
        .message p {
          font-size: 21px;
        }
        .footer {
          flex-direction: column;
        }
        .toolbar {
          padding: 15px;
        }
        .toolbar h2 {
          font-size: 13px;
        }
        .mic-status {
          font-size: 10px;
        }
        .guide {
          font-size: 11px;
        }
        .vision .message p {
          font-size: 27px;
        }
        .notes-panel {
          padding: 18px;
        }
      }

      .connection-hub {
        background: #fff;
        border: 1px solid #d6e2d3;
        border-radius: 14px;
        padding: 24px;
        margin: 27px 0 25px;
      }
      .hub-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
      }
      .hub-heading h2 {
        font-size: 17px;
        margin: 0;
      }
      .connection-badge {
        font-size: 10px;
        border-radius: 20px;
        padding: 6px 10px;
        background: #eef3e9;
        color: #496440;
      }
      .connection-badge.connected {
        background: #dcebd6;
        color: #254f22;
      }
      .platforms {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin: 17px 0 12px;
      }
      .platform {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        color: var(--ink);
        padding: 11px 18px;
        display: flex;
        align-items: center;
        gap: 9px;
        font-weight: 600;
        font-size: 13px;
      }
      .platform[aria-pressed='true'] {
        background: #e9f2e5;
        border-color: #75976b;
      }
      .platform-mark {
        width: 20px;
        height: 20px;
        background: #087cbd;
        color: white;
        border-radius: 5px;
        display: grid;
        place-items: center;
        font-size: 12px;
        font-weight: 750;
      }
      .zoom-mark {
        background: #246df0;
      }
      .connection-hub p {
        font-size: 12px;
        color: var(--muted);
        line-height: 1.8;
        margin: 10px 0;
      }
      .call-link-row {
        display: flex;
        align-items: center;
        gap: 15px;
        margin: 19px 0;
      }
      .call-link-row > div {
        flex: 1;
        min-width: 0;
      }
      .call-link-row label {
        font-size: 11px;
        display: block;
        margin-bottom: 5px;
      }
      .call-link-row input {
        width: 100%;
        background: #fafcf7;
        border: 1px solid var(--line);
        padding: 11px;
        border-radius: 7px;
        color: var(--ink);
        font: inherit;
      }
      .call-link-row small {
        font-size: 10px;
        color: var(--muted);
        display: block;
        margin-top: 5px;
      }
      .call-link-row a {
        text-decoration: none;
        white-space: nowrap;
      }
      .call-link-row a[aria-disabled='true'] {
        opacity: 0.5;
      }
      .call-steps {
        list-style: none;
        counter-reset: step;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 18px;
        padding: 16px 0;
        margin: 15px 0;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
      }
      .call-steps li {
        counter-increment: step;
        font-size: 11px;
        position: relative;
        padding-left: 26px;
      }
      .call-steps li:before {
        content: counter(step);
        position: absolute;
        left: 0;
        top: 0;
        border: 1px solid #c8d6c3;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: #47673a;
        font-size: 10px;
      }
      .call-steps b {
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .call-steps span {
        color: var(--muted);
      }
      .connection-hub .call-boundary {
        font-size: 11px;
        max-width: 950px;
      }
      .agreement {
        border-top: 1px solid var(--line);
        padding-top: 13px;
        margin-bottom: 0;
      }
      .agreement span {
        font-size: 12px;
      }
      .practice-context {
        padding: 11px 14px;
        background: #f3f6ed;
        border-radius: 7px;
        margin: 15px 0;
        display: flex;
        gap: 15px;
        align-items: center;
        flex-wrap: wrap;
        font-size: 12px;
      }
      .practice-context span {
        color: var(--muted);
      }
      .practice-context a {
        margin-left: auto;
      }
      .modes {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin: 12px 0 23px;
      }
      .mode {
        min-width: 0;
        padding: 17px;
      }
      .mode b {
        font-size: 14px;
        margin-bottom: 5px;
      }
      .mode span {
        font-size: 11px;
      }
      #testVoice {
        margin-bottom: 8px;
        width: 100%;
      }
      #stopSpeech {
        width: 100%;
      }
      .intro h1 {
        font-size: clamp(30px, 3.4vw, 43px);
      }
      .feature-label {
        margin-top: 25px;
      }
      .intro .guide {
        align-self: end;
      }
      @media (max-width: 680px) {
        .connection-hub {
          padding: 18px;
          margin-top: 22px;
        }
        .hub-heading {
          align-items: start;
          flex-direction: column;
          gap: 8px;
        }
        .platforms {
          gap: 7px;
        }
        .platform {
          padding: 9px;
          font-size: 11px;
          gap: 5px;
        }
        .call-link-row {
          flex-direction: column;
          align-items: stretch;
        }
        .call-steps {
          grid-template-columns: 1fr;
          gap: 15px;
        }
        .modes {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .mode {
          padding: 14px;
        }
        .mode b {
          font-size: 12px;
        }
        .mode span {
          font-size: 11px;
        }
        .intro .guide {
          align-self: start;
        }
      }
      .voice-inline {
        background: #f2f6ed;
        border: 1px solid #e1e8db;
        border-radius: 7px;
        padding: 10px 12px;
        margin: 12px 0 17px;
        display: flex;
        flex-direction: column;
        align-items: start;
        gap: 5px;
      }
      .voice-inline span {
        font-size: 11px;
        color: var(--muted);
      }
      .voice-inline button {
        font-size: 11px;
      }
      .call-guide {
        margin: 14px 0;
        font-size: 11px;
        color: var(--muted);
      }
      .call-guide summary {
        cursor: pointer;
        color: var(--green);
        font-weight: 550;
      }
      .connection-hub {
        margin-top: 20px;
      }
      .feature-label {
        margin-top: 25px;
      }
      .modes {
        margin-bottom: 20px;
      }
      main#main {
        display: flex;
        flex-direction: column;
      }
      main#main > .intro {
        order: 1;
      }
      main#main > .hearing {
        order: 2;
      }
      main#main > .connection-hub {
        order: 3;
      }
      main#main > #status {
        order: 4;
      }
      main#main > .tabs {
        order: 5;
      }
      main#main > .layout {
        order: 6;
      }
      main#main > .quiet-more {
        order: 7;
      }
      main#main > .footer {
        order: 8;
      }
      .hearing {
        background: #fff;
        border: 1px solid #e0c9a4;
        border-radius: 10px;
        padding: 14px 16px;
        margin: 0 0 16px;
        font-size: 16px;
        line-height: 1.45;
      }
      .quiet-more {
        margin: 18px 0;
      }
      #moreOptions {
        margin-top: 14px;
      }
      #moreOptions summary,
      .quiet-more summary {
        cursor: pointer;
        font-weight: 650;
        color: var(--green);
      }
      .connection-hub {
        margin-top: 0;
      }
      #audioMeter {
        width: 72px;
        height: 10px;
        margin-left: 8px;
      }
      #browserSpeechOffer {
        order: 4;
        margin: 0 0 16px;
        padding: 14px 16px;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 10px;
      }
      #browserSpeechNote {
        color: var(--muted);
        font-size: 13px;
        margin: 8px 0 0;
      }
      body {
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        font-size: 16px;
        line-height: 1.5;
        background: #f3f6f1;
        color: #17332c;
      }
      header {
        padding: 14px max(24px, calc((100vw - 1180px) / 2));
        box-shadow: 0 1px 0 #e3ebe4;
      }
      .brand {
        font-size: 20px;
        letter-spacing: -0.4px;
      }
      .header-right a,
      .badge {
        font-size: 14px;
      }
      .badge {
        background: #e7f0e6;
        color: #1b5344;
        border-radius: 999px;
        padding: 6px 12px;
      }
      main {
        padding: 22px max(20px, calc((100vw - 1180px) / 2)) 56px;
      }
      .intro {
        margin: 0 0 14px;
        align-items: end;
      }
      .intro h1 {
        font-size: 32px;
        letter-spacing: -0.7px;
        margin: 0 0 4px;
      }
      .intro p {
        font-size: 16px;
        max-width: 40rem;
        color: #3e564b;
      }
      .guide {
        min-height: 44px;
        border-radius: 10px;
        font-size: 14px;
        padding: 10px 14px;
      }
      .hearing {
        font-size: 15px;
        line-height: 1.45;
        border: 0;
        border-left: 4px solid #c4a574;
        border-radius: 12px;
        background: #fffdf8;
        box-shadow: 0 1px 2px #193b3408;
        margin: 0 0 14px;
        padding: 12px 16px;
      }
      .connection-hub {
        margin: 0 0 14px;
        padding: 16px 18px;
        border-radius: 16px;
        border-color: #e3ebe4;
        box-shadow: 0 8px 28px #193b340a;
      }
      .hub-heading h2 {
        font-size: 18px;
      }
      .connection-badge {
        font-size: 13px;
        padding: 6px 10px;
      }
      .platforms {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: 14px 0 10px;
        background: #f3f6f1;
        padding: 4px;
        border-radius: 12px;
      }
      .platform {
        flex: 1 1 140px;
        justify-content: center;
        min-height: 44px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        font-size: 15px;
        font-weight: 650;
      }
      .platform {
        color: #17332c;
      }
      .platform[aria-pressed='true'] {
        background: #fff;
        color: #1b5344;
        box-shadow:
          0 1px 2px #193b3414,
          0 0 0 1px #d7e3d8;
      }
      .connection-hub p,
      .call-link-row label,
      .call-link-row small,
      .call-steps li {
        font-size: 14px;
        line-height: 1.5;
      }
      .call-link-row input,
      .panel select,
      .panel textarea {
        font-size: 16px;
        border-radius: 10px;
        padding: 12px;
        min-height: 46px;
      }
      .status {
        font-size: 15px;
        border-radius: 12px;
        padding: 12px 14px;
        margin: 0 0 14px;
      }
      .tabs {
        gap: 8px;
        margin: 4px 0 12px;
      }
      .tabs button {
        font-size: 15px;
        padding: 10px 2px;
      }
      .layout {
        gap: 18px;
        align-items: start;
      }
      .conversation {
        border-radius: 16px;
        border-color: #d7e3d8;
        box-shadow: 0 10px 32px #193b3412;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .toolbar {
        order: 0;
        padding: 14px 18px;
      }
      .toolbar h2 {
        font-size: 16px;
      }
      .mic-status {
        font-size: 13px;
      }
      .captions-wrap {
        order: 2;
        height: min(36vh, 320px);
        min-height: 220px;
        background: #fbfcf9;
      }
      .empty {
        padding: 28px 20px;
      }
      .empty h3 {
        font-size: 24px;
        letter-spacing: -0.4px;
      }
      .empty p {
        font-size: 16px;
        max-width: 34rem;
      }
      .message {
        padding: 14px 4px;
      }
      .message p,
      .interim {
        font-size: 24px;
        line-height: 1.45;
      }
      .message time,
      .message .subtle {
        font-size: 13px;
      }
      .caption-controls {
        order: 1;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
        padding: 14px 16px;
        background: #fff;
      }
      .caption-controls .agreement {
        border: 0;
        margin: 0;
        padding: 0;
        font-size: 15px;
        color: #17332c;
      }
      .caption-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .caption-actions .danger {
        margin-left: auto;
      }
      .primary,
      .secondary {
        min-height: 44px;
        border-radius: 10px;
        font-size: 15px;
        padding: 11px 16px;
      }
      .caption-actions .primary {
        padding: 12px 18px;
      }
      .notice {
        font-size: 14px;
        line-height: 1.5;
        margin: 12px 2px 0;
      }
      .panel {
        border-radius: 16px;
        padding: 18px;
        border-color: #e3ebe4;
        box-shadow: 0 10px 32px #193b340d;
      }
      .panel h2 {
        font-size: 18px;
      }
      .panel p,
      .panel label,
      .panel legend,
      .voice-inline,
      .quick button {
        font-size: 14px;
        line-height: 1.5;
      }
      .panel textarea {
        min-height: 96px;
      }
      .quick {
        gap: 8px;
      }
      .quick button {
        border-radius: 999px;
        padding: 8px 12px;
        background: #f3f6f1;
      }
      .composer-controls {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
      }
      #speakReply {
        min-height: 48px;
        font-size: 16px;
      }
      .check-label {
        font-size: 15px;
        gap: 10px;
      }
      .check-label input {
        width: 18px;
        height: 18px;
      }
      #moreOptions {
        margin-top: 16px;
        background: #fff;
        border: 1px solid #e3ebe4;
        border-radius: 14px;
        padding: 14px 16px;
      }
      #moreOptions summary {
        font-size: 15px;
      }
      #notes {
        font-size: 17px;
        line-height: 1.55;
        min-height: 220px;
      }
      .footer {
        font-size: 13px;
        line-height: 1.5;
      }
      #browserSpeechOffer {
        border-radius: 14px;
        padding: 16px;
      }
      @media (min-width: 1000px) {
        main#main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          column-gap: 20px;
          row-gap: 12px;
          align-items: start;
        }
        main#main > .intro,
        main#main > .hearing,
        main#main > .connection-hub,
        main#main > #status,
        main#main > #browserSpeechOffer,
        main#main > .tabs,
        .layout > div {
          grid-column: 1;
        }
        .layout > div {
          order: 6;
        }
        main#main > .footer {
          grid-column: 1 / -1;
        }
        .layout {
          display: contents;
        }
        .layout > aside {
          grid-column: 2;
          grid-row: 1 / span 8;
          position: sticky;
          top: 16px;
          align-self: start;
        }
        main#main > .intro,
        main#main > .hearing,
        main#main > .connection-hub,
        main#main > #status,
        main#main > .tabs {
          margin-bottom: 0;
        }
        .intro h1 {
          font-size: 28px;
        }
        .connection-hub {
          padding: 12px 14px;
        }
        .platforms {
          margin: 8px 0 4px;
        }
        .captions-wrap {
          height: 200px;
          min-height: 180px;
        }
        .empty {
          padding: 16px;
        }
      }
      @media (max-width: 760px) {
        main {
          padding: 16px 14px 40px;
        }
        .intro h1 {
          font-size: 28px;
        }
        .platforms,
        .caption-actions,
        .composer-controls {
          flex-direction: column;
          display: flex;
        }
        .platform,
        .caption-actions .primary,
        .caption-actions .secondary,
        .caption-actions .subtle,
        .composer-controls .primary,
        .composer-controls .secondary {
          width: 100%;
        }
        .caption-actions .danger {
          margin-left: 0;
        }
        .message p,
        .interim {
          font-size: 22px;
        }
        .captions-wrap {
          height: auto;
          min-height: 320px;
        }
      }
      .mark {
        width: 34px;
        height: 34px;
        display: block;
        flex: none;
      }
      .wordmark {
        font-weight: 720;
        letter-spacing: -0.06em;
        font-size: 21px;
        line-height: 1;
        color: #17332c;
      }
      .wordmark i {
        font-family: Georgia, 'Iowan Old Style', serif;
        font-style: italic;
        font-weight: 520;
        color: #1f5949;
        letter-spacing: -0.03em;
      }
    </style>
  </head>
  <body>
    <a class="skip" href="#main">Aller \xE0 la conversation</a>
    <header>
      <a class="brand" href="/" aria-label="accescompanion, retour \xE0 la recherche"
        ><svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
          <rect width="40" height="40" rx="12" fill="#1b5344" />
          <path
            d="M12 29V17.2a8 8 0 0 1 16 0V29"
            fill="none"
            stroke="#f3f6f1"
            stroke-width="2.3"
            stroke-linecap="round"
          />
          <circle cx="20" cy="19.2" r="2.15" fill="#d7ebc8" /></svg
        ><b class="wordmark">acces<i>companion</i></b></a
      >
      <div class="header-right">
        <a href="/cabinets">\u2190 Trouver un cabinet</a
        ><span class="badge">Pendant le rendez-vous</span>
      </div>
    </header>
    <main id="main">
      <div class="intro">
        <div>
          <h1>L\u2019\xE9change</h1>
          <p>Lisez ce qui se dit, \xE9crivez votre r\xE9ponse, puis v\xE9rifiez que le m\xE9decin l\u2019entend.</p>
        </div>
        <button class="guide" id="readGuide">\xC9couter les rep\xE8res</button>
      </div>
      <p id="hearingStatus" class="hearing" role="status">
        Le m\xE9decin n\u2019entend pas encore votre r\xE9ponse.
      </p>
      <section class="connection-hub" aria-labelledby="connectionTitle">
        <div class="hub-heading">
          <div>
            <div class="eyebrow">LE LIEU</div>
            <h2 id="connectionTitle">O\xF9 se passe le rendez-vous ?</h2>
          </div>
          <span class="connection-badge" id="connectionBadge">Microphone de cet appareil</span>
        </div>
        <div id="practiceContext" class="practice-context" hidden>
          <strong id="practiceName"></strong><span id="practiceAddress"></span
          ><a id="practiceDoctolib" target="_blank" rel="noopener noreferrer" hidden
            >Fiche Doctolib \u2197</a
          >
        </div>
        <div class="platforms" role="group" aria-label="Lieu de la consultation">
          <button class="platform" data-platform="office" aria-pressed="true">\u2302 En cabinet</button
          ><button class="platform" data-platform="doctolib" aria-pressed="false">
            <span class="platform-mark">D</span> Doctolib \xB7 vid\xE9o</button
          ><button class="platform" data-platform="zoom" aria-pressed="false">
            <span class="platform-mark zoom-mark">Z</span> Zoom \xB7 vid\xE9o
          </button>
        </div>
        <p id="platformHelp">
          Placez cet appareil entre vous et le m\xE9decin. Le microphone capte les voix dans la pi\xE8ce.
        </p>
        <div id="videoSetup" hidden>
          <div class="call-link-row">
            <div>
              <label for="callUrl">Lien personnel du rendez-vous re\xE7u par e-mail ou SMS</label
              ><input
                id="callUrl"
                type="url"
                autocomplete="off"
                placeholder="https://\u2026"
                spellcheck="false"
              /><small>Utilis\xE9 dans cette page uniquement ; jamais envoy\xE9 au serveur.</small>
            </div>
            <a
              id="openCall"
              class="secondary"
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled="true"
              >Ouvrir mon appel \u2197</a
            >
          </div>
          <div class="row">
            <button class="primary" id="connectCallAudio">Connecter le son de l\u2019appel</button
            ><button class="secondary" id="disconnectCallAudio" disabled>D\xE9connecter le son</button>
          </div>
          <p id="callAudioStatus" role="status">Aucun son d\u2019appel connect\xE9.</p>
          <details class="call-guide">
            <summary>Comment partager le son et transmettre ma r\xE9ponse ?</summary>
            <ol class="call-steps">
              <li>
                <b>Ouvrez votre appel</b
                ><span>Connectez-vous sur Doctolib ou Zoom dans un autre onglet.</span>
              </li>
              <li>
                <b>Partagez le son de cet onglet</b
                ><span
                  >Choisissez l\u2019onglet de l\u2019appel et cochez \xAB Partager l\u2019audio \xBB dans le
                  navigateur.</span
                >
              </li>
              <li>
                <b>D\xE9marrez les sous-titres</b
                ><span
                  >Gardez accescompanion \xE0 c\xF4t\xE9 de la vid\xE9o, dans une autre fen\xEAtre si
                  possible.</span
                >
              </li>
            </ol>
            <p class="call-boundary">
              L\u2019appel reste sur sa plateforme. accescompanion ne rejoint pas la r\xE9union \xE0 votre
              place. Vos r\xE9ponses parl\xE9es sortent de cet appareil : pour les transmettre au
              soignant, utilisez le partage audio si votre plateforme le permet et v\xE9rifiez qu\u2019il
              les entend. Sinon, convenez d\u2019un moyen \xE9crit avec lui.
            </p>
          </details>
          <button class="subtle" id="copyReplyForCall">
            Copier ma r\xE9ponse pour le chat de l\u2019appel
          </button>
        </div>
      </section>
      <div id="status" class="status" role="status">
        Le microphone est coup\xE9. Vous pouvez d\xE9j\xE0 \xE9changer par \xE9crit.
      </div>
      <div id="browserSpeechOffer" hidden>
        <button class="primary" id="useBrowserSpeech" type="button">
          \xC9crire avec le service vocal du navigateur
        </button>
        <p id="browserSpeechNote">
          Ce bouton accepte que le service vocal du navigateur puisse envoyer l\u2019audio \xE0 son
          fournisseur. accescompanion ne re\xE7oit pas cet audio.
        </p>
      </div>
      <div class="tabs" role="tablist" aria-label="Espace de consultation">
        <button
          id="conversationTab"
          role="tab"
          aria-selected="true"
          aria-controls="conversationPanel"
        >
          Conversation</button
        ><button
          id="notesTab"
          role="tab"
          aria-selected="false"
          aria-controls="notesPanel"
          tabindex="-1"
        >
          Mon r\xE9capitulatif
        </button>
      </div>
      <div class="layout">
        <div>
          <section id="conversationPanel" role="tabpanel" aria-labelledby="conversationTab">
            <div class="conversation">
              <div class="toolbar">
                <h2>Votre \xE9change en direct</h2>
                <span class="mic-status" id="micState"
                  ><span class="indicator" aria-hidden="true"></span
                  ><span id="micText">Microphone coup\xE9</span
                  ><meter
                    id="audioMeter"
                    min="0"
                    max="100"
                    value="0"
                    hidden
                    aria-label="Niveau du son re\xE7u de l\u2019onglet"
                  ></meter
                ></span>
              </div>
              <div class="caption-controls">
                <label class="check-label agreement"
                  ><input type="checkbox" id="consent" /><span
                    >Les personnes pr\xE9sentes sont inform\xE9es et d\u2019accord pour activer les
                    sous-titres.</span
                  ></label
                >
                <div class="caption-actions">
                  <button class="primary" id="startCaptions">D\xE9marrer les sous-titres</button
                  ><button class="secondary" id="pauseCaptions" disabled>Mettre en pause</button
                  ><button class="subtle danger" id="clearSession">Effacer la session</button>
                </div>
              </div>
              <div class="captions-wrap" id="captionScroll">
                <div class="empty" id="empty">
                  <svg viewBox="0 0 120 90" fill="none" aria-hidden="true">
                    <circle cx="61" cy="42" r="37" fill="#edf2e6" />
                    <path d="M22 21h65v37H54L39 72V58H22Z" stroke="#63806a" stroke-width="2" />
                    <path d="M42 34h28M42 44h17" stroke="#63806a" stroke-width="2" />
                    <path d="M73 58h25V40M78 69h12l10 9v-9" stroke="#b59b6b" stroke-width="2" />
                  </svg>
                  <h3>Ce qui se dit</h3>
                  <p>
                    D\xE9marrez les sous-titres apr\xE8s l\u2019accord des personnes pr\xE9sentes, ou \xE9crivez
                    votre r\xE9ponse.
                  </p>
                  <button class="subtle" id="loadDemo">
                    Voir un exemple fictif, sans microphone
                  </button>
                </div>
                <div
                  id="transcript"
                  role="log"
                  aria-label="Conversation transcrite, \xE0 v\xE9rifier"
                  aria-live="polite"
                  aria-relevant="additions text"
                ></div>
                <div id="interim" class="interim" aria-hidden="true"></div>
              </div>
            </div>
            <p class="notice">
              <strong>Les sous-titres peuvent contenir des erreurs.</strong> Cliquez sur \xAB Corriger
              \xBB si n\xE9cessaire. Faites confirmer les noms de m\xE9dicaments, les doses et les consignes
              par le soignant. Aucun texte n\u2019est une interpr\xE9tation m\xE9dicale.
            </p>
            <span class="demo-label" id="demoLabel"></span>
          </section>
          <section
            id="notesPanel"
            class="notes-panel"
            role="tabpanel"
            aria-labelledby="notesTab"
            hidden
          >
            <div class="eyebrow">\xC0 RELIRE ENSEMBLE</div>
            <h2>Mon r\xE9capitulatif de la visite</h2>
            <p>
              R\xE9digez vos notes ou recopiez les phrases de l\u2019\xE9change. Le brouillon reprend les
              messages mot pour mot : il ne produit pas de synth\xE8se m\xE9dicale par IA.
            </p>
            <button class="secondary" id="draftNotes">Cr\xE9er un brouillon depuis l\u2019\xE9change</button>
            <p id="notesWarning" role="status"></p>
            <label for="notes">Mes notes, \xE0 v\xE9rifier avec le soignant</label
            ><textarea
              id="notes"
              maxlength="24000"
              placeholder="Ce que nous avons discut\xE9\u2026\\nLes consignes confirm\xE9es par le soignant\u2026\\nMes questions restantes\u2026"
            ></textarea
            ><label class="check-label"
              ><input type="checkbox" id="reviewed" /><span
                >J\u2019ai relu ces notes et fait confirmer les \xE9l\xE9ments importants par le
                soignant.</span
              ></label
            >
            <div class="row">
              <button class="primary" id="readNotes" disabled>\xC9couter mon r\xE9capitulatif</button
              ><button class="secondary" id="copyNotes">Copier mes notes</button>
            </div>
            <p class="notice">
              Ces notes ne remplacent pas le compte rendu ou l\u2019ordonnance du soignant. Le texte
              reste dans cette page jusqu\u2019\xE0 son effacement ou sa fermeture.
            </p>
          </section>
        </div>
        <aside aria-label="Mes outils de communication">
          <section class="panel composer">
            <h2>Votre r\xE9ponse</h2>
            <p>
              \xC9crivez ce que vous voulez dire. Affichez-le au m\xE9decin, ou faites-le lire \xE0 voix
              haute.
            </p>
            <div class="voice-inline">
              <span id="activeVoiceLabel">Voix fran\xE7aise de cet appareil</span
              ><button class="subtle" id="quickVoiceTest">\xC9couter un exemple</button>
            </div>
            <label for="reply">Mon message</label
            ><textarea
              id="reply"
              maxlength="4000"
              placeholder="\xC9crivez votre r\xE9ponse ici\u2026"
            ></textarea>
            <div class="quick" aria-label="Phrases \xE0 pr\xE9parer">
              <button data-phrase="Pouvez-vous r\xE9p\xE9ter, s\u2019il vous pla\xEEt ?">
                R\xE9p\xE9tez, s\u2019il vous pla\xEEt</button
              ><button data-phrase="J\u2019ai une question.">J\u2019ai une question</button
              ><button data-phrase="Pouvez-vous parler plus lentement ?">Plus lentement</button
              ><button data-phrase="J\u2019ai besoin d\u2019une pause.">Une pause</button>
            </div>
            <div class="composer-controls">
              <button class="secondary" id="showReply">Afficher</button
              ><button class="primary" id="speakReply">Lire ma r\xE9ponse</button>
            </div>
            <button
              class="subtle"
              id="manualToggle"
              style="margin-top: 13px"
              aria-expanded="false"
              aria-controls="manualForm"
            >
              Saisir aussi les paroles du soignant
            </button>
            <div id="manualForm" hidden>
              <label for="manualDoctor">Paroles du soignant, saisies manuellement</label
              ><textarea
                id="manualDoctor"
                maxlength="4000"
                placeholder="Saisir une phrase\u2026"
              ></textarea
              ><button class="secondary" id="addDoctor" style="margin-top: 10px">
                Ajouter \xE0 l\u2019\xE9change
              </button>
            </div>
          </section>
          <details id="moreOptions">
            <summary>R\xE9glages des sous-titres</summary>
            <section class="panel settings">
              <h2>R\xE9glages des sous-titres</h2>
              <label for="recognitionMode">Traitement de la parole</label
              ><select id="recognitionMode">
                <option value="local">Sur cet appareil uniquement</option>
                <option value="browser">Service vocal du navigateur</option>
              </select>
              <p class="helper" id="recognitionHelp">
                Aucun envoi audio via accescompanion. La reconnaissance locale n\xE9cessite un
                navigateur et un pack fran\xE7ais compatibles.
              </p>
              <label class="check-label" id="remoteConsentLabel" hidden
                ><input type="checkbox" id="remoteConsent" /><span
                  >J\u2019accepte que le service vocal du navigateur puisse envoyer l\u2019audio \xE0 son
                  fournisseur. Les personnes pr\xE9sentes en sont inform\xE9es.</span
                ></label
              ><button class="subtle" id="installLanguage" hidden>
                T\xE9l\xE9charger le pack de fran\xE7ais
              </button>
              <p class="helper" id="supportInfo"></p>
            </section>
          </details>
        </aside>
      </div>
      <footer class="footer">
        <span>accescompanion \xB7 L\u2019\xE9change pendant le rendez-vous.</span
        ><span>Aucun enregistrement audio ni conversation conserv\xE9s.</span>
      </footer>
    </main>
    <dialog id="editDialog" aria-labelledby="editTitle">
      <h2 id="editTitle">Corriger une phrase</h2>
      <p>
        Conservez le sens de ce qui a \xE9t\xE9 dit. Demandez confirmation au soignant en cas de doute.
      </p>
      <label for="editText">Phrase corrig\xE9e</label
      ><textarea id="editText" maxlength="4000"></textarea>
      <div class="row">
        <button class="primary" id="saveEdit">Enregistrer la correction</button
        ><button class="secondary" id="cancelEdit">Annuler</button>
      </div>
    </dialog>
    <dialog id="replaceDialog" aria-labelledby="replaceTitle">
      <h2 id="replaceTitle">Remplacer mes notes ?</h2>
      <p>
        Vos notes actuelles seront remplac\xE9es par les phrases de la conversation. Elles ne sont pas
        enregistr\xE9es ailleurs.
      </p>
      <div class="row">
        <button class="primary" id="confirmDraft">Remplacer par le brouillon</button
        ><button class="secondary" id="cancelDraft">Garder mes notes</button>
      </div>
    </dialog>
    <script>
      (() => {
  // src/companion-core.mjs
  var speakerLabel = (speaker) => ({
    patient: "Patient \\xB7 message \\xE9crit",
    doctor: "Soignant \\xB7 saisie manuelle",
    captured: "Parole capt\\xE9e \\xB7 locuteur non identifi\\xE9"
  })[speaker] || "Message";
  function buildDraft(messages2) {
    if (!messages2.length) return "";
    const demo = messages2.some((m) => m.demo);
    return (demo ? "EXEMPLE FICTIF \\u2014 ne pas utiliser comme notes m\\xE9dicales.\\n\\n" : "") + "BROUILLON DE CONVERSATION \\u2014 \\xC0 RELIRE AVEC LE SOIGNANT\\nTranscription non v\\xE9rifi\\xE9e, sans interpr\\xE9tation ni synth\\xE8se m\\xE9dicale.\\n\\n" + messages2.map((m) => \`\${speakerLabel(m.speaker)}\${m.corrected ? " \\xB7 corrig\\xE9" : ""}
\${m.text}\`).join("\\n\\n");
  }
  function validateMessage(text) {
    if (typeof text !== "string" || !text.trim())
      throw new Error("\\xC9crivez un message avant de continuer.");
    if (text.length > 4e3) throw new Error("Limitez ce message \\xE0 4 000 caract\\xE8res.");
    return text.trim();
  }
  function speechError(code) {
    return {
      "not-allowed": "L\\u2019acc\\xE8s au microphone a \\xE9t\\xE9 refus\\xE9. Autorisez-le dans le navigateur, puis r\\xE9essayez, ou utilisez la saisie manuelle.",
      "service-not-allowed": "Le service vocal n\\u2019est pas autoris\\xE9 dans ce navigateur. Vous pouvez \\xE9changer par \\xE9crit.",
      "audio-capture": "Aucun microphone utilisable. V\\xE9rifiez votre appareil ou utilisez la saisie manuelle.",
      network: "Le service vocal est indisponible. Aucun red\\xE9marrage automatique : r\\xE9essayez ou utilisez la saisie manuelle.",
      "no-speech": "Aucune parole d\\xE9tect\\xE9e. Les sous-titres sont arr\\xEAt\\xE9s ; vous pouvez les relancer.",
      "language-not-supported": "Le fran\\xE7ais n\\u2019est pas disponible dans ce mode. Installez le pack local si propos\\xE9, ou choisissez explicitement le service du navigateur.",
      aborted: "Les sous-titres sont arr\\xEAt\\xE9s."
    }[code] || "La reconnaissance vocale s\\u2019est arr\\xEAt\\xE9e. Vous pouvez r\\xE9essayer ou saisir les paroles manuellement.";
  }
  function safeCallUrl(value, platform) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
      const h = u.hostname.toLowerCase();
      const allowed = platform === "doctolib" ? h === "doctolib.fr" || h.endsWith(".doctolib.fr") : platform === "zoom" ? h === "zoom.us" || h.endsWith(".zoom.us") || h === "zoom.com" || h.endsWith(".zoom.com") : false;
      return allowed ? u.href : null;
    } catch {
      return null;
    }
  }
  function supportsCallAudio(userAgent, hasDisplayMedia) {
    const version = userAgent.match(/(?:Chrome|Chromium|Edg)\\/(\\d+)/);
    return !!hasDisplayMedia && !!version && Number(version[1]) >= 135 && !/Android|iPhone|iPad|Mobile/.test(userAgent);
  }

  // src/companion.js
  var $ = (id) => document.getElementById(id);
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis;
  var messages = [];
  var nextId = 1;
  var recognition = null;
  var listening = false;
  var starting = false;
  var generation = 0;
  var voices = [];
  var utterance = null;
  var editingId = null;
  var demoActive = false;
  var sharedStream = null;
  var sessionPlatform = "office";
  var connectionGeneration = 0;
  var callMonitor = null;
  var callMonitorSource = null;
  var callAnalyser = null;
  var callMeterTimer = null;
  var heardCallAudio = false;
  var captionRetry = null;
  var captionWatch = null;
  var captionFatal = false;
  var silentRestarts = 0;
  var status = (text, error = false) => {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
  };
  function micState(text, active = false) {
    if (sharedStream && text === "Microphone coup\\xE9") text = "Son d\\u2019onglet connect\\xE9 \\xB7 en pause";
    $("micText").textContent = text;
    document.title = active ? "\\u25CF Sous-titres \\u2014 accescompanion" : "Mon rendez-vous \\u2014 accescompanion";
    $("micState").classList.toggle("recording", active);
    $("pauseCaptions").disabled = !active && !starting;
    $("startCaptions").disabled = !Recognition || active || starting || !!utterance;
  }
  function invalidateNotes() {
    if ($("notes").value) {
      stopSpeech();
      $("reviewed").checked = false;
      $("readNotes").disabled = true;
      $("notesWarning").textContent = "L\\u2019\\xE9change a chang\\xE9. V\\xE9rifiez ou actualisez vos notes avant de les \\xE9couter.";
    }
  }
  function captionHint(text) {
    const note = document.querySelector("#empty p");
    if (note)
      note.textContent = text || "D\\xE9marrez les sous-titres apr\\xE8s l\\u2019accord des personnes pr\\xE9sentes, ou \\xE9crivez votre r\\xE9ponse.";
  }
  function stopCallMonitor() {
    if (callMeterTimer) {
      clearInterval(callMeterTimer);
      callMeterTimer = null;
    }
    heardCallAudio = false;
    try {
      callMonitorSource?.disconnect();
    } catch {
    }
    callMonitorSource = null;
    callAnalyser = null;
    const context = callMonitor;
    callMonitor = null;
    if (context) context.close().catch(() => {
    });
    const meter = $("audioMeter");
    if (meter) {
      meter.value = 0;
      meter.hidden = true;
    }
  }
  function hearSharedCall(stream) {
    stopCallMonitor();
    if (typeof AudioContext !== "function" || !(stream instanceof MediaStream)) return;
    try {
      const context = new AudioContext();
      callMonitor = context;
      const source = context.createMediaStreamSource(stream);
      callMonitorSource = source;
      source.connect(context.destination);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      callAnalyser = analyser;
      const samples = new Float32Array(analyser.fftSize);
      const meter = $("audioMeter");
      if (meter) meter.hidden = false;
      const began = Date.now();
      callMeterTimer = setInterval(() => {
        if (!callAnalyser || !sharedStream) return;
        callAnalyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const value of samples) energy += value * value;
        const rms = Math.sqrt(energy / samples.length);
        if (meter) meter.value = Math.round(Math.min(100, rms * 400));
        if (rms > 0.012) heardCallAudio = true;
        if (!listening || messages.length || Date.now() - began < 3500) return;
        if (!heardCallAudio) {
          captionHint(
            "Votre propre microphone n\\u2019est pas inclus dans le son de l\\u2019onglet. Seule la voix des autres participants, jou\\xE9e par l\\u2019appel, peut devenir un sous-titre."
          );
          status(
            "Aucun son ne sort de l\\u2019onglet. Votre propre microphone n\\u2019est pas inclus dans le son partag\\xE9.",
            true
          );
        } else if ($("recognitionMode").value === "local") {
          captionHint(
            "Du son arrive, mais le mode sur cet appareil ne transcrit pas cet onglet. Ouvrez les r\\xE9glages et choisissez le service vocal du navigateur."
          );
          status(
            "Du son arrive de l\\u2019onglet, sans parole reconnue. Choisissez \\xAB Service vocal du navigateur \\xBB, acceptez, puis relancez les sous-titres.",
            true
          );
        }
      }, 400);
      context.resume?.();
    } catch {
      stopCallMonitor();
    }
  }
  function releaseSharedAudio() {
    connectionGeneration++;
    stopCallMonitor();
    const stream = sharedStream;
    sharedStream = null;
    stream?.getTracks().forEach((t) => t.stop());
    if ($("disconnectCallAudio")) $("disconnectCallAudio").disabled = true;
    updateConnection();
  }
  function stopSpeech() {
    if (synth) synth.cancel();
    utterance = null;
    $("startCaptions").disabled = !Recognition || starting || listening;
  }
  function clearCaptionRetry() {
    if (captionRetry) {
      clearTimeout(captionRetry);
      captionRetry = null;
    }
  }
  function clearCaptionWatch() {
    if (captionWatch) {
      clearTimeout(captionWatch);
      captionWatch = null;
    }
  }
  function offerBrowserSpeech(show) {
    const offer = $("browserSpeechOffer");
    if (offer) offer.hidden = !show;
  }
  function armCaptionWatch(r, token) {
    clearCaptionWatch();
    captionWatch = setTimeout(() => {
      captionWatch = null;
      if (recognition !== r || token !== generation || !listening) return;
      if (($("interim").textContent || "").trim() || messages.some((m) => m.speaker === "captured" && !m.demo))
        return;
      try {
        r.stop();
      } catch {
      }
    }, 8e3);
  }
  function pauseCaptions(announce = true, disconnect = true) {
    clearCaptionRetry();
    clearCaptionWatch();
    offerBrowserSpeech(false);
    generation++;
    starting = false;
    listening = false;
    captionFatal = false;
    const r = recognition;
    recognition = null;
    try {
      r?.abort();
    } catch {
    }
    if (disconnect) releaseSharedAudio();
    $("interim").textContent = "";
    micState("Microphone coup\\xE9");
    if (announce) status("Sous-titres en pause. La capture audio est arr\\xEAt\\xE9e.");
  }
  function render() {
    const log = $("transcript");
    log.replaceChildren();
    $("empty").hidden = messages.length > 0;
    $("demoLabel").textContent = demoActive ? "EXEMPLE FICTIF \\xB7 Aucune voix r\\xE9elle capt\\xE9e." : "";
    for (const m of messages) {
      const article = document.createElement("div");
      article.className = "message" + (m.speaker === "patient" ? " patient" : "");
      const meta = document.createElement("div");
      meta.className = "meta";
      const label = document.createElement("span");
      label.textContent = speakerLabel(m.speaker) + (m.corrected ? " \\xB7 corrig\\xE9" : "") + (m.demo ? " \\xB7 fictif" : "");
      const edit = document.createElement("button");
      edit.className = "edit";
      edit.textContent = "Corriger";
      edit.setAttribute("aria-label", "Corriger : " + m.text.slice(0, 45));
      edit.onclick = () => {
        editingId = m.id;
        $("editText").value = m.text;
        $("editDialog").showModal();
        $("editText").focus();
      };
      meta.append(label, edit);
      const text = document.createElement("p");
      text.textContent = m.text;
      article.append(meta, text);
      log.append(article);
    }
    $("captionScroll").scrollTop = $("captionScroll").scrollHeight;
  }
  function append(text, speaker, demo = false) {
    const value = validateMessage(text);
    if (messages.length >= 150 || messages.reduce((n, m) => n + m.text.length, 0) + value.length > 2e4)
      throw new Error(
        "La session a atteint sa limite. Copiez vos notes, puis effacez la session pour continuer."
      );
    invalidateNotes();
    messages.push({ id: nextId++, text: value, speaker, demo, corrected: false });
    render();
  }
  function checkDemo() {
    if (demoActive) throw new Error("Effacez l\\u2019exemple fictif avant de commencer un \\xE9change r\\xE9el.");
  }
  function refreshVoices() {
    voices = synth ? synth.getVoices().filter((v) => v.localService === true && /^fr(?:-|_|$)/i.test(v.lang)) : [];
    const ready = voices.length > 0;
    $("speakReply").disabled = !ready;
    $("readGuide").disabled = !ready;
    $("quickVoiceTest").disabled = !ready;
    $("activeVoiceLabel").textContent = ready ? "Voix fran\\xE7aise de cet appareil" : "Aucune voix fran\\xE7aise locale d\\xE9tect\\xE9e";
    $("readNotes").disabled = !ready || !$("reviewed").checked || !$("notes").value.trim();
  }
  async function speak(text) {
    const value = text.trim();
    if (!value) {
      status("\\xC9crivez un texte avant de le faire lire.", true);
      return false;
    }
    const voice = voices[0];
    if (!synth || !voice) {
      status(
        "Aucune voix fran\\xE7aise locale disponible. Votre texte peut \\xEAtre affich\\xE9 \\xE0 l\\u2019\\xE9cran.",
        true
      );
      return false;
    }
    pauseCaptions(false, false);
    stopSpeech();
    const u = new SpeechSynthesisUtterance(value);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1;
    utterance = u;
    micState("Microphone coup\\xE9");
    u.onend = () => {
      if (utterance !== u) return;
      utterance = null;
      micState("Microphone coup\\xE9");
    };
    u.onerror = () => {
      if (utterance !== u) return;
      utterance = null;
      micState("Microphone coup\\xE9");
    };
    try {
      synth.speak(u);
      status(
        "Lecture vocale activ\\xE9e. Les sous-titres sont en pause ; relancez-les ensuite si n\\xE9cessaire."
      );
      return true;
    } catch {
      utterance = null;
      micState("Microphone coup\\xE9");
      status("La lecture vocale est indisponible.", true);
      return false;
    }
  }
  async function startCaptions() {
    try {
      checkDemo();
      if (sessionPlatform !== "office" && (!sharedStream || sharedStream.getAudioTracks()[0]?.readyState !== "live"))
        throw new Error(
          "Connectez d\\u2019abord le son de l\\u2019onglet de votre appel. Le microphone ne remplace pas le son d\\u2019une visioconf\\xE9rence."
        );
      if (!Recognition)
        throw new Error(
          "Ce navigateur ne propose pas de reconnaissance vocale. Utilisez la saisie manuelle."
        );
      if (!$("consent").checked)
        throw new Error("Confirmez l\\u2019accord des personnes pr\\xE9sentes avant d\\u2019activer le microphone.");
      const local = $("recognitionMode").value === "local";
      if (!local && !$("remoteConsent").checked)
        throw new Error(
          "Acceptez explicitement le traitement audio par le service du navigateur, ou gardez le mode local."
        );
      stopSpeech();
      const token = ++generation;
      captionFatal = false;
      silentRestarts = 0;
      clearCaptionRetry();
      clearCaptionWatch();
      const previous = recognition;
      recognition = null;
      try {
        previous?.abort();
      } catch {
      }
      starting = true;
      micState("V\\xE9rification du service\\u2026");
      const r = new Recognition();
      r.lang = "fr-FR";
      r.interimResults = true;
      r.maxAlternatives = 1;
      if (local) {
        if (!("processLocally" in r))
          throw new Error(
            "La reconnaissance sur cet appareil n\\u2019est pas prise en charge. Aucun audio n\\u2019a \\xE9t\\xE9 envoy\\xE9. Utilisez la saisie manuelle ou choisissez le service du navigateur."
          );
        r.processLocally = true;
        if (typeof Recognition.available === "function") {
          const available = await Recognition.available({ langs: ["fr-FR"], processLocally: true });
          if (token !== generation) return;
          if (available !== "available") {
            $("installLanguage").hidden = !["downloadable", "downloading"].includes(available) || typeof Recognition.install !== "function";
            throw new Error(
              available === "unavailable" ? "Aucun pack fran\\xE7ais local compatible. Aucun envoi vers un service distant." : "Le pack fran\\xE7ais doit \\xEAtre install\\xE9 avant de d\\xE9marrer les sous-titres."
            );
          }
        }
      } else if ("processLocally" in r) r.processLocally = false;
      if (token !== generation || !$("consent").checked) return;
      r.continuous = !local;
      recognition = r;
      const keepCaptionSession = () => $("consent").checked && ($("recognitionMode").value !== "browser" || $("remoteConsent").checked) && (sessionPlatform === "office" || sharedStream?.getAudioTracks()[0]?.readyState === "live");
      const localStalled = () => sessionPlatform === "office" && local && silentRestarts >= 1 && !messages.some((m) => m.speaker === "captured" && !m.demo);
      const stalledCopy = "Le mode sur cet appareil n\\u2019\\xE9crit aucune phrase. Cliquez sur \\xAB \\xC9crire avec le service vocal du navigateur \\xBB, juste sous ce message.";
      r.onstart = () => {
        if (recognition !== r) return;
        starting = false;
        listening = true;
        micState(sharedStream ? "Son de l\\u2019onglet actif" : "Microphone actif", true);
        updateConnection();
        if (local) armCaptionWatch(r, token);
        if (localStalled()) {
          offerBrowserSpeech(true);
          captionHint(stalledCopy);
          status(stalledCopy, true);
          return;
        }
        offerBrowserSpeech(false);
        if (sharedStream)
          captionHint(
            "Votre propre microphone n\\u2019est pas sous-titr\\xE9. Seule la voix des autres, jou\\xE9e dans l\\u2019onglet de l\\u2019appel, peut s\\u2019afficher ici."
          );
        status(
          sharedStream ? "Sous-titres de l\\u2019onglet partag\\xE9. Votre propre microphone n\\u2019y est pas inclus." : "Microphone actif" + (local ? " \\xB7 une phrase \\xE0 la fois, sur cet appareil." : " \\xB7 traitement par le service vocal du navigateur.")
        );
      };
      r.onresult = (e) => {
        if (recognition !== r || !listening) return;
        let interim = "";
        try {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i];
            const text = result[0]?.transcript || "";
            if (result.isFinal && text.trim()) {
              silentRestarts = 0;
              offerBrowserSpeech(false);
              append(text, "captured");
            } else interim += text;
          }
          $("interim").textContent = interim;
          $("captionScroll").scrollTop = $("captionScroll").scrollHeight;
          if ((interim.trim() || messages.some((m) => m.speaker === "captured" && !m.demo)) && local)
            armCaptionWatch(r, token);
        } catch (error) {
          pauseCaptions(false);
          status(error.message, true);
        }
      };
      r.onerror = (e) => {
        if (recognition !== r) return;
        if ((e.error === "no-speech" || e.error === "aborted") && keepCaptionSession()) return;
        captionFatal = true;
        pauseCaptions(false, false);
        status(speechError(e.error), true);
      };
      r.onend = () => {
        if (recognition !== r) return;
        clearCaptionWatch();
        if (captionFatal || !keepCaptionSession()) {
          recognition = null;
          starting = false;
          listening = false;
          $("interim").textContent = "";
          micState(sharedStream ? "Son d\\u2019onglet connect\\xE9 \\xB7 en pause" : "Microphone coup\\xE9");
          updateConnection();
          status(
            sharedStream ? "Les sous-titres se sont arr\\xEAt\\xE9s. Le son de l\\u2019appel reste audible ici. Cliquez sur \\xAB D\\xE9marrer les sous-titres \\xBB." : "L\\u2019\\xE9coute s\\u2019est arr\\xEAt\\xE9e. Relancez les sous-titres pour reprendre ; aucun red\\xE9marrage automatique."
          );
          return;
        }
        listening = false;
        starting = false;
        if (messages.some((m) => m.speaker === "captured" && !m.demo)) silentRestarts = 0;
        else silentRestarts++;
        micState(sharedStream ? "Son de l\\u2019onglet actif" : "Microphone actif", true);
        updateConnection();
        if (localStalled()) {
          offerBrowserSpeech(true);
          captionHint(stalledCopy);
          status(stalledCopy, true);
        } else
          status(
            sessionPlatform === "office" ? "Microphone du cabinet ouvert. Les sous-titres reprennent d\\xE8s qu\\u2019une phrase est entendue." : "En attente de parole dans l\\u2019onglet. L\\u2019\\xE9coute reprend sur le m\\xEAme son."
          );
        const retryToken = token;
        captionRetry = setTimeout(() => {
          captionRetry = null;
          if (recognition !== r || retryToken !== generation || captionFatal || !keepCaptionSession())
            return;
          try {
            if (sharedStream) r.start(sharedStream.getAudioTracks()[0]);
            else r.start();
          } catch {
            captionFatal = true;
            pauseCaptions(false, false);
            status(
              "La reprise des sous-titres a \\xE9chou\\xE9. Cliquez sur \\xAB D\\xE9marrer les sous-titres \\xBB.",
              true
            );
          }
        }, 400);
      };
      if (sharedStream) r.start(sharedStream.getAudioTracks()[0]);
      else r.start();
    } catch (error) {
      pauseCaptions(false, false);
      status(error.message || "Le service vocal est indisponible.", true);
    }
  }
  $("startCaptions").onclick = startCaptions;
  $("pauseCaptions").onclick = () => pauseCaptions();
  $("useBrowserSpeech").onclick = () => {
    pauseCaptions(false, false);
    $("moreOptions").open = true;
    $("recognitionMode").value = "browser";
    $("remoteConsentLabel").hidden = false;
    $("remoteConsent").checked = true;
    $("recognitionHelp").textContent = "Ce mode peut transmettre l\\u2019audio au fournisseur du navigateur. accescompanion ne re\\xE7oit pas cet audio. Son traitement d\\xE9pend du navigateur.";
    startCaptions();
  };
  $("recognitionMode").onchange = () => {
    pauseCaptions(false, false);
    const remote = $("recognitionMode").value === "browser";
    $("remoteConsentLabel").hidden = !remote;
    $("remoteConsent").checked = false;
    $("installLanguage").hidden = true;
    $("recognitionHelp").textContent = remote ? "Ce mode peut transmettre l\\u2019audio au fournisseur du navigateur. accescompanion ne re\\xE7oit pas cet audio. Son traitement d\\xE9pend du navigateur." : "Aucun envoi audio via accescompanion. Le mode local n\\xE9cessite un navigateur et un pack fran\\xE7ais compatibles.";
    status("Mode modifi\\xE9. Le microphone reste coup\\xE9.");
  };
  $("consent").onchange = () => {
    if (!$("consent").checked) pauseCaptions();
  };
  $("remoteConsent").onchange = () => {
    if (!$("remoteConsent").checked) pauseCaptions();
  };
  $("installLanguage").onclick = async () => {
    const b = $("installLanguage");
    b.disabled = true;
    try {
      if (typeof Recognition?.install !== "function") throw new Error("Installation indisponible.");
      status("T\\xE9l\\xE9chargement du pack fran\\xE7ais. Aucun microphone activ\\xE9.");
      const ok = await Recognition.install({ langs: ["fr-FR"], processLocally: true });
      if (!ok) throw new Error("Le pack fran\\xE7ais n\\u2019a pas pu \\xEAtre install\\xE9.");
      b.hidden = true;
      status("Pack install\\xE9. Vous pouvez d\\xE9marrer les sous-titres.");
    } catch (e) {
      status(e.message, true);
    } finally {
      b.disabled = false;
    }
  };
  $("showReply").onclick = () => {
    try {
      checkDemo();
      append($("reply").value, "patient");
      $("reply").value = "";
      status("Message affich\\xE9. Aucun son n\\u2019a \\xE9t\\xE9 jou\\xE9.");
    } catch (e) {
      status(e.message, true);
    }
  };
  $("speakReply").onclick = async () => {
    try {
      checkDemo();
      const text = validateMessage($("reply").value);
      if (!voices.length) throw new Error("Aucune voix fran\\xE7aise locale disponible.");
      append(text, "patient");
      if (await speak(text)) $("reply").value = "";
    } catch (e) {
      status(e.message, true);
    }
  };
  document.querySelectorAll("[data-phrase]").forEach(
    (b) => b.onclick = () => {
      $("reply").value = b.dataset.phrase;
      $("reply").focus();
      status("Phrase pr\\xE9par\\xE9e. Choisissez \\xAB Afficher \\xBB ou \\xAB Lire ma r\\xE9ponse \\xBB.");
    }
  );
  $("manualToggle").onclick = () => {
    const open = $("manualForm").hidden;
    $("manualForm").hidden = !open;
    $("manualToggle").setAttribute("aria-expanded", String(open));
    if (open) $("manualDoctor").focus();
  };
  $("addDoctor").onclick = () => {
    try {
      checkDemo();
      append($("manualDoctor").value, "doctor");
      $("manualDoctor").value = "";
      status("Phrase du soignant ajout\\xE9e manuellement.");
    } catch (e) {
      status(e.message, true);
    }
  };
  $("loadDemo").onclick = () => {
    pauseCaptions(false);
    stopSpeech();
    demoActive = true;
    append("Bonjour. Qu\\u2019aimeriez-vous aborder pendant cette consultation ?", "doctor", true);
    append("Pouvez-vous parler plus lentement ? Je lis les sous-titres.", "patient", true);
    append(
      "Bien s\\xFBr. Nous pouvons prendre le temps de lire et de corriger les phrases ensemble.",
      "doctor",
      true
    );
    status(
      "Exemple fictif affich\\xE9. Aucun microphone activ\\xE9. Effacez la session avant un \\xE9change r\\xE9el."
    );
  };
  $("clearSession").onclick = () => {
    pauseCaptions(false);
    stopSpeech();
    messages = [];
    nextId = 1;
    demoActive = false;
    editingId = null;
    for (const id of ["reply", "manualDoctor", "notes", "editText"]) $(id).value = "";
    $("consent").checked = false;
    $("remoteConsent").checked = false;
    $("callUrl").value = "";
    updateCallLink();
    $("reviewed").checked = false;
    $("readNotes").disabled = true;
    $("notesWarning").textContent = "";
    $("editDialog").close();
    $("replaceDialog").close();
    captionHint();
    render();
    status(
      "Session effac\\xE9e. Le microphone est coup\\xE9 ; les messages et notes ont \\xE9t\\xE9 supprim\\xE9s de cette page."
    );
    window.dispatchEvent(new Event("accescompanion:session-cleared"));
  };
  $("saveEdit").onclick = () => {
    try {
      const text = validateMessage($("editText").value);
      const m = messages.find((m2) => m2.id === editingId);
      if (m) {
        m.text = text;
        m.corrected = true;
        invalidateNotes();
        render();
      }
      $("editText").value = "";
      $("editDialog").close();
      status("Phrase corrig\\xE9e. V\\xE9rifiez le sens avec la personne qui l\\u2019a prononc\\xE9e.");
    } catch (e) {
      status(e.message, true);
    }
  };
  $("cancelEdit").onclick = () => $("editDialog").close();
  function tab(name) {
    const notes = name === "notes";
    if (notes) {
      pauseCaptions(false, false);
      status("Sous-titres en pause pendant la relecture de vos notes.");
    }
    for (const [id, on] of [
      ["conversationTab", !notes],
      ["notesTab", notes]
    ]) {
      $(id).setAttribute("aria-selected", String(on));
      $(id).tabIndex = on ? 0 : -1;
    }
    $("conversationPanel").hidden = notes;
    $("notesPanel").hidden = !notes;
  }
  $("conversationTab").onclick = () => tab("conversation");
  $("notesTab").onclick = () => tab("notes");
  document.querySelector("[role=tablist]").onkeydown = (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const notes = e.key === "End" || e.key !== "Home" && $("conversationTab").getAttribute("aria-selected") === "true";
      tab(notes ? "notes" : "conversation");
      $(notes ? "notesTab" : "conversationTab").focus();
    }
  };
  function draft() {
    const text = buildDraft(messages);
    if (!text) {
      $("notesWarning").textContent = "Ajoutez une phrase \\xE0 la conversation avant de pr\\xE9parer vos notes.";
      return;
    }
    if (text.length > 24e3) {
      $("notesWarning").textContent = "Cet \\xE9change est trop long pour le brouillon. R\\xE9digez un r\\xE9capitulatif dans le champ ci-dessous.";
      return;
    }
    stopSpeech();
    $("notes").value = text;
    $("reviewed").checked = false;
    $("readNotes").disabled = true;
    $("notesWarning").textContent = "Brouillon copi\\xE9 mot pour mot. Corrigez les erreurs et r\\xE9sumez-le avec le soignant avant de le valider.";
  }
  $("draftNotes").onclick = () => {
    if ($("notes").value.trim() && messages.length) $("replaceDialog").showModal();
    else draft();
  };
  $("confirmDraft").onclick = () => {
    draft();
    $("replaceDialog").close();
  };
  $("cancelDraft").onclick = () => $("replaceDialog").close();
  $("notes").oninput = () => {
    stopSpeech();
    $("reviewed").checked = false;
    $("readNotes").disabled = true;
    $("notesWarning").textContent = "Notes modifi\\xE9es : relisez-les avant la lecture vocale.";
  };
  $("reviewed").onchange = () => {
    $("readNotes").disabled = !$("reviewed").checked || !$("notes").value.trim() || !voices.length;
    if (!$("reviewed").checked) stopSpeech();
  };
  $("readNotes").onclick = () => {
    if ($("reviewed").checked) speak($("notes").value);
  };
  $("copyNotes").onclick = async () => {
    if (!$("notes").value.trim()) {
      $("notesWarning").textContent = "\\xC9crivez ou pr\\xE9parez vos notes avant de les copier.";
      return;
    }
    try {
      await navigator.clipboard.writeText(
        "NOTES PERSONNELLES " + ($("reviewed").checked ? "\\u2014 relues" : "\\u2014 NON VALID\\xC9ES") + "\\n\\n" + $("notes").value
      );
      $("notesWarning").textContent = "Notes copi\\xE9es \\xE0 votre demande. Elles peuvent contenir des informations de sant\\xE9.";
    } catch {
      $("notesWarning").textContent = "Copie indisponible. S\\xE9lectionnez vos notes et copiez-les manuellement.";
    }
  };
  $("readGuide").onclick = () => speak(
    "Vous \\xEAtes dans l\\u2019\\xE9change accescompanion. Le bouton D\\xE9marrer les sous-titres active l\\u2019\\xE9coute apr\\xE8s votre accord. Dans Votre r\\xE9ponse, \\xE9crivez une phrase, puis choisissez Afficher ou Lire ma r\\xE9ponse. Le m\\xE9decin entend cette voix seulement si l\\u2019appareil est pr\\xE8s de lui, ou si le son de cette page est partag\\xE9 dans l\\u2019appel. Cette lecture ne d\\xE9crit pas votre environnement physique."
  );
  if (synth) synth.addEventListener("voiceschanged", refreshVoices);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopSpeech();
      if (!sharedStream) {
        pauseCaptions(false);
        status("La page a quitt\\xE9 le premier plan. Microphone et lecture arr\\xEAt\\xE9s.");
      }
    } else if (callMonitor?.state === "suspended") callMonitor.resume?.();
  });
  window.addEventListener("pagehide", () => {
    $("clearSession").onclick();
  });
  $("supportInfo").textContent = Recognition ? "Le microphone ne d\\xE9marre jamais automatiquement. En cas d\\u2019indisponibilit\\xE9, utilisez \\xAB Saisir aussi les paroles du soignant \\xBB." : "Reconnaissance vocale indisponible dans ce navigateur. La saisie manuelle reste utilisable.";
  micState("Microphone coup\\xE9");
  refreshVoices();
  function updateConnection() {
    const connected = !!sharedStream;
    $("connectionBadge").classList.toggle("connected", connected);
    $("connectionBadge").textContent = connected ? listening ? "Son d\\u2019onglet \\xB7 sous-titres actifs" : "Son d\\u2019onglet \\xB7 pr\\xEAt" : sessionPlatform === "office" ? "Microphone de cet appareil" : "Son de l\\u2019appel non connect\\xE9";
    $("callAudioStatus").textContent = connected ? "Vous entendez cet appel sur cette page. Laissez accescompanion ouvert \\xE0 c\\xF4t\\xE9 de la vid\\xE9o." : supportsCallAudio(navigator.userAgent, !!navigator.mediaDevices?.getDisplayMedia) ? "Aucun son d\\u2019appel connect\\xE9. Choisissez l\\u2019onglet de la vid\\xE9o, pas la fen\\xEAtre enti\\xE8re, et cochez \\xAB Partager l\\u2019audio de l\\u2019onglet \\xBB." : "Le partage du son d\\u2019un onglet n\\xE9cessite Chrome ou Edge r\\xE9cent sur ordinateur. La saisie manuelle reste disponible.";
    if ($("hearingStatus"))
      $("hearingStatus").textContent = sessionPlatform === "office" ? "En cabinet, le m\\xE9decin entend la voix de cet appareil s\\u2019il est pr\\xE8s de vous." : !connected ? "Le son de l\\u2019appel n\\u2019est pas connect\\xE9. Coller le lien ne suffit pas : cliquez sur \\xAB Connecter le son de l\\u2019appel \\xBB, choisissez l\\u2019onglet Zoom ou Doctolib, et cochez \\xAB Partager l\\u2019audio de l\\u2019onglet \\xBB." : listening ? "Vous entendez l\\u2019appel sur cette page et les sous-titres sont actifs. Laissez cette page ouverte \\xE0 c\\xF4t\\xE9 de la vid\\xE9o." : "L\\u2019appel est connect\\xE9 et audible sur cette page. D\\xE9marrez les sous-titres pour afficher les paroles.";
    $("connectCallAudio").disabled = !supportsCallAudio(
      navigator.userAgent,
      !!navigator.mediaDevices?.getDisplayMedia
    );
  }
  function updateCallLink() {
    const href = safeCallUrl($("callUrl").value, sessionPlatform);
    $("openCall").href = href || "#";
    $("openCall").setAttribute("aria-disabled", String(!href));
  }
  document.querySelectorAll("[data-platform]").forEach(
    (b) => b.onclick = () => {
      pauseCaptions(false);
      stopSpeech();
      sessionPlatform = b.dataset.platform;
      document.querySelectorAll("[data-platform]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $("videoSetup").hidden = sessionPlatform === "office";
      $("callUrl").value = "";
      updateCallLink();
      $("platformHelp").textContent = sessionPlatform === "office" ? "Placez cet appareil entre vous et le m\\xE9decin. Le microphone capte les voix dans la pi\\xE8ce." : "Ouvrez " + (sessionPlatform === "zoom" ? "Zoom" : "Doctolib") + " dans un autre onglet. Ici, choisissez cet onglet-l\\xE0 et cochez \\xAB Partager l\\u2019audio de l\\u2019onglet \\xBB. Ne choisissez pas la page accescompanion : elle n\\u2019a pas le son de l\\u2019appel.";
      updateConnection();
      status("Mode de consultation modifi\\xE9. Aucune capture audio active.");
    }
  );
  $("callUrl").oninput = updateCallLink;
  $("openCall").onclick = (e) => {
    const href = safeCallUrl($("callUrl").value, sessionPlatform);
    if (!href) {
      e.preventDefault();
      status(
        "Collez un lien HTTPS de " + (sessionPlatform === "zoom" ? "Zoom" : "Doctolib") + " pour ouvrir votre rendez-vous.",
        true
      );
    } else status("Votre appel s\\u2019ouvre dans un autre onglet. Revenez ici pour connecter son audio.");
  };
  $("connectCallAudio").onclick = async () => {
    let stream = null;
    try {
      checkDemo();
      if (!$("consent").checked)
        throw new Error("Confirmez l\\u2019accord des personnes pr\\xE9sentes avant de partager le son.");
      if (!supportsCallAudio(navigator.userAgent, !!navigator.mediaDevices?.getDisplayMedia))
        throw new Error("Le partage du son n\\xE9cessite Chrome ou Edge r\\xE9cent sur ordinateur.");
      pauseCaptions(false);
      const token = ++connectionGeneration;
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { suppressLocalAudioPlayback: true },
        selfBrowserSurface: "exclude",
        systemAudio: "include",
        surfaceSwitching: "exclude"
      });
      if (token !== connectionGeneration) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = stream.getVideoTracks()[0];
      const audio = stream.getAudioTracks()[0];
      if (video?.getSettings().displaySurface !== "browser")
        throw new Error("Choisissez un onglet du navigateur, pas une fen\\xEAtre ou l\\u2019\\xE9cran entier.");
      if (!audio || audio.readyState !== "live")
        throw new Error("Aucun son partag\\xE9. R\\xE9essayez en cochant \\xAB Partager l\\u2019audio de l\\u2019onglet \\xBB.");
      try {
        video.stop();
      } catch {
      }
      if (audio.readyState !== "live")
        throw new Error(
          "Le son de l\\u2019onglet s\\u2019est arr\\xEAt\\xE9 avec l\\u2019image. R\\xE9essayez en cochant \\xAB Partager l\\u2019audio de l\\u2019onglet \\xBB."
        );
      sharedStream = stream;
      hearSharedCall(stream);
      audio.onended = () => {
        if (sharedStream !== stream) return;
        pauseCaptions(false);
        status("Le partage a \\xE9t\\xE9 arr\\xEAt\\xE9. Aucun son d\\u2019appel n\\u2019est capt\\xE9.");
      };
      $("disconnectCallAudio").disabled = false;
      updateConnection();
      micState("Son d\\u2019onglet connect\\xE9 \\xB7 en pause");
      status("Son de l\\u2019appel connect\\xE9. Vous l\\u2019entendez sur cette page.");
      await startCaptions();
    } catch (e) {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      releaseSharedAudio();
      status(
        e.name === "NotAllowedError" ? "Partage annul\\xE9 ou refus\\xE9. Aucun son d\\u2019appel connect\\xE9." : e.message || "Le partage du son est indisponible.",
        true
      );
    }
  };
  $("disconnectCallAudio").onclick = () => pauseCaptions();
  $("copyReplyForCall").onclick = async () => {
    try {
      const text = validateMessage($("reply").value);
      await navigator.clipboard.writeText(text);
      status("R\\xE9ponse copi\\xE9e. Collez-la vous-m\\xEAme dans le chat de votre appel.");
    } catch (e) {
      status(e.message || "Copie indisponible. S\\xE9lectionnez votre r\\xE9ponse manuellement.", true);
    }
  };
  (async () => {
    const id = new URLSearchParams(location.search).get("practice");
    if (!id) return;
    try {
      const r = await fetch("/api/practice?id=" + encodeURIComponent(id));
      if (!r.ok) return;
      const p = await r.json();
      $("practiceName").textContent = p.name;
      $("practiceAddress").textContent = p.address;
      $("practiceContext").hidden = false;
      const href = safeCallUrl(p.doctolibUrl, "doctolib");
      if (href) {
        $("practiceDoctolib").href = href;
        $("practiceDoctolib").hidden = false;
      }
    } catch {
    }
  })();
  updateConnection();
  $("quickVoiceTest").onclick = () => speak("Bonjour. Cette voix fran\\xE7aise peut lire vos messages pendant votre rendez-vous.");
  window.accescompanionSession = Object.freeze({
    hasRealMessages: () => messages.some((message) => !message.demo),
    getFictionalMessages() {
      if (messages.some((message) => !message.demo)) {
        throw new Error("Seuls les messages fictifs peuvent \\xEAtre partag\\xE9s.");
      }
      return messages.map((message) => ({ ...message }));
    },
    loadExample: () => $("loadDemo").click(),
    prepareReadingMode(mode) {
      tab("conversation");
      document.body.classList.toggle("vision", mode === "vision");
      const target = mode === "speak" ? "reply" : mode === "vision" ? "readGuide" : "startCaptions";
      $(target).focus();
    },
    applyDraft(text) {
      if ($("notes").value.trim()) return false;
      if (typeof text !== "string" || text.length > 24e3) {
        throw new Error("Brouillon invalide.");
      }
      tab("notes");
      $("notes").value = text;
      $("notes").dispatchEvent(new Event("input"));
      return true;
    },
    async speakApprovedReply(text) {
      if (!demoActive || messages.some((message) => !message.demo)) {
        throw new Error("La lecture MCP est r\\xE9serv\\xE9e au test fictif.");
      }
      const value = validateMessage(text);
      const played = await speak(value);
      if (played) append(value, "patient", true);
      return played;
    },
    clear: () => $("clearSession").click()
  });
})();

    <\/script>
  </body>
</html>
` });
export {
  stdin_default as default
};
