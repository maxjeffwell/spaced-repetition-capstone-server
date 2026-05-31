'use strict';
const chai = require('chai');
const expect = chai.expect;
const { QdrantService } = require('../ml/qdrant-service');
const { cardPointId } = require('../ml/card-id');

describe('QdrantService', function() {
  let svc, calls;

  beforeEach(function() {
    calls = { upsert: [], delete: [], recommend: [] };
    svc = new QdrantService();
    svc.enabled = true;
    svc.collection = 'test_cards';
    // Stub the Qdrant REST client
    svc.client = {
      upsert: async (coll, body) => { calls.upsert.push({ coll, body }); },
      delete: async (coll, body) => { calls.delete.push({ coll, body }); },
      recommend: async (coll, body) => {
        calls.recommend.push({ coll, body });
        return [
          { id: 'x', score: 0.9, payload: { cardId: 'c1', question: 'casa', answer: 'house' } },
          { id: 'y', score: 0.2, payload: { cardId: 'c2', question: 'sol', answer: 'sun' } }
        ];
      }
    };
    // Stub embeddings (avoid network/tokenizer)
    svc.embeddingClient = { embed: async () => [0.1, 0.2, 0.3] };
  });

  it('upsertCard writes a point keyed by the card UUID with userId payload', async function() {
    await svc.upsertCard({ _id: '507f1f77bcf86cd799439011', question: 'casa', answer: 'house' }, 'user1');
    expect(calls.upsert).to.have.lengthOf(1);
    const pt = calls.upsert[0].body.points[0];
    expect(pt.id).to.equal(cardPointId('507f1f77bcf86cd799439011'));
    expect(pt.payload).to.deep.include({ userId: 'user1', cardId: '507f1f77bcf86cd799439011' });
    expect(pt.vector).to.deep.equal([0.1, 0.2, 0.3]);
  });

  it('deleteCard removes by mapped UUID', async function() {
    await svc.deleteCard('507f1f77bcf86cd799439011');
    expect(calls.delete[0].body.points[0]).to.equal(cardPointId('507f1f77bcf86cd799439011'));
  });

  it('related filters by userId, applies score floor, caps k', async function() {
    const out = await svc.related('507f1f77bcf86cd799439011', 'user1', 5, 0.5);
    const body = calls.recommend[0].body;
    expect(body.filter.must[0]).to.deep.equal({ key: 'userId', match: { value: 'user1' } });
    expect(body.positive[0]).to.equal(cardPointId('507f1f77bcf86cd799439011'));
    // 0.2 result dropped by score floor
    expect(out).to.have.lengthOf(1);
    expect(out[0]).to.deep.equal({ cardId: 'c1', question: 'casa', answer: 'house', score: 0.9 });
  });

  it('related returns [] when disabled', async function() {
    svc.enabled = false;
    const out = await svc.related('507f1f77bcf86cd799439011', 'user1', 5, 0.5);
    expect(out).to.deep.equal([]);
  });
});
