import assert from 'node:assert/strict';

const base = new URL(process.argv[2] || 'https://accescheck.vercel.app');
async function request(path, body) {
  const response = await fetch(new URL(path, base), {
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, path);
  return response;
}
async function verify() {
  const [home, catalog, consultation] = await Promise.all([
    request('/').then((response) => response.text()),
    request('/api/catalog').then((response) => response.json()),
    request('/consultation').then((response) => response.text()),
  ]);
  assert.ok(home.includes('id="asciiFlow"'));
  assert.ok(!home.includes('/__dev/'));
  assert.ok(consultation.includes('id="startCaptions"'));
  assert.ok(catalog.count >= 100 && catalog.count <= 20000);
  if (process.env.REQUIRE_SEARCH_AGENT === 'true') {
    const config = await (await request('/api/ai-config')).json();
    assert.equal(
      config.available,
      true,
      'The production search agent must receive its server key.',
    );
  }
  const result = await (
    await request('/api/discover', {
      confirmed: true,
      needs: { keys: ['hearing'], minWidth: null },
    })
  ).json();
  assert.ok(result.results.length > 0);
  assert.ok(result.dataset.checksum);
  console.log(
    `Public deployment verified: homepage, consultation and ${catalog.count} imported practices.`,
  );
}

for (let attempt = 0; attempt < 10; attempt++) {
  try {
    await verify();
    break;
  } catch (error) {
    if (attempt === 9) throw error;
    console.log('Waiting for the public alias to serve the new deployment…');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
