import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { purgeDevice } from './deviceCleanup.ts';
describe('purgeDevice', () => { it('remove a chave mesmo se o banco falhar', async () => { const calls: string[] = []; const complete = await purgeDevice({ deleteCredentials: async () => { calls.push('credentials'); }, clearDatabase: async () => { calls.push('database'); throw new Error('db'); }, deleteLocalKey: async () => { calls.push('key'); } }); assert.equal(complete, false); assert.equal(calls.includes('key'), true); }); });
