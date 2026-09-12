import test from 'node:test';
import assert from 'node:assert/strict';
import { postMlListing } from '../../supabase/functions/_shared/ml-publication.mjs';

test('retries a rejected legacy payload once with family_name and without title', async () => {
  const calls = [];
  const fetcher = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return calls.length === 1
      ? Response.json({ message: 'The body does not contains some or none of the following properties [family_name].' }, { status: 400 })
      : Response.json({ id: 'MLB123' }, { status: 201 });
  };
  const payload = { title: 'Kit Orcs RPG', price: 39.9, sale_terms: [{ id: 'MANUFACTURING_TIME', value_name: '5 days' }] };
  const result = await postMlListing(payload, 'test-token', fetcher);
  assert.equal(result.status, 201);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { family_name: payload.title, price: payload.price, sale_terms: payload.sale_terms });
  assert.equal(payload.title, 'Kit Orcs RPG');
});

for (const status of [201, 401, 429, 500]) {
  test(`does not retry HTTP ${status}`, async () => {
    let calls = 0;
    const result = await postMlListing({ title: 'Kit' }, 'token', async () => {
      calls++;
      return Response.json({ message: 'family_name' }, { status });
    });
    assert.equal(result.status, status);
    assert.equal(calls, 1);
  });
}
test('does not retry unrelated validation failures', async () => {
  let calls = 0;
  await postMlListing({ title: 'Kit' }, 'token', async () => {
    calls++;
    return Response.json({ message: 'price invalid' }, { status: 400 });
  });
  assert.equal(calls, 1);
});

test('returns a second validation failure without a retry loop', async () => {
  let calls = 0;
  const result = await postMlListing({ title: 'Kit' }, 'token', async () => {
    calls++;
    return Response.json({ message: 'family_name is required' }, { status: 400 });
  });
  assert.equal(result.status, 400);
  assert.equal(calls, 2);
});

test('network failure is not retried', async () => {
  let calls = 0;
  await assert.rejects(postMlListing({ title: 'Kit' }, 'token', async () => {
    calls++;
    throw new Error('connection lost');
  }), /connection lost/);
  assert.equal(calls, 1);
});
