const { MongoClient } = require('mongodb');

// Singleton client — MongoClient manages an internal connection pool.
// Never close this; it lives for the lifetime of the process.
let _client = null;

async function connectToDb() {
  if (!_client) {
    const client = new MongoClient(process.env.DB_URI);
    await client.connect(); // assign only after successful connect so failures allow retry
    _client = client;
    console.log('DB: connected (pool ready)');
  }
  return _client;
}

function getDb() {
  if (!_client) throw new Error('DB not connected — call connectToDb() first');
  return _client.db(process.env.DB_NAME);
}

async function insertData(collectionName, data) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const collection = db.collection(collectionName);
  if (Array.isArray(data)) {
    const dataWithInsertDate = data.map(item => ({ ...item, insertDate: Date.now() }));
    await collection.insertMany(dataWithInsertDate);
  } else if (typeof data === 'object') {
    data.insertDate = Date.now();
    await collection.insertOne(data);
  } else {
    console.error('DB: invalid data type passed to insertData');
  }
}


async function findUserData(collectionName, uid) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  return db.collection(collectionName).find({ userId: uid }).sort({ date: -1 }).toArray();
}

async function findFilterData(collectionName, filter) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const collection = db.collection(collectionName);
  const results = [];
  for (const element of filter) {
    const result = await collection
      .find({ transaction_id: element.transaction_id, pending: true })
      .sort({ date: -1 })
      .toArray();
    results.push(...result);
  }
  return results;
}

async function findUnmappedData(collectionName, userId) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const query = userId
    ? { userId, mappedCategory: { $exists: false } }
    : { mappedCategory: { $exists: false } };
  return db.collection(collectionName).find(query).toArray();
}

async function updateManyData(collectionName, filter, update) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const result = await db.collection(collectionName).updateMany(filter, update);
  console.log(`DB: updateMany matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  return result;
}

async function updateData(collectionName, filter, update, options = null) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  await db.collection(collectionName).updateOne(filter, update, options);
}

async function deduplicateData(collectionName, userId) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const collection = db.collection(collectionName);
  const matchStage = userId ? { $match: { userId } } : { $match: {} };
  const result = await collection.aggregate([
    matchStage,
    { $group: { _id: { transaction_id: '$transaction_id' }, count: { $sum: 1 }, docs: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();
  for (const docGroup of result) {
    await collection.deleteMany({ _id: { $in: docGroup.docs.slice(1) } });
  }
  console.log('DB: deduplicateData() complete');
}

async function deleteRemovedData(collectionName, filter) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  return db.collection(collectionName).deleteMany(filter);
}

async function cleanPendingTransactions(collectionName, userId) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const collection = db.collection(collectionName);
  const findFilter = userId ? { pending: true, userId } : { pending: true };
  const allPending = await collection.find(findFilter).toArray();
  if (allPending.length === 0) return { deletedCount: 0 };

  const orClauses = allPending.map(t => ({
    $and: [{ pending_transaction_id: t.transaction_id }, { pending: false }],
  }));
  const keepers = await collection.find({ $or: orClauses }).toArray();
  const idsToRemove = [...new Set(keepers.map(t => t.pending_transaction_id))];
  return collection.deleteMany({ transaction_id: { $in: idsToRemove } });
}

async function findMerchantsWithStats(userId) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const results = await db.collection('Plaid-Transactions').aggregate([
    { $match: { userId, merchant_name: { $exists: true, $ne: null } } },
    { $group: {
        _id: '$merchant_name',
        count: { $sum: 1 },
        categories: { $addToSet: '$mappedCategory' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray();
  return results.map(r => ({
    merchant_name: r._id,
    count: r.count,
    categories: r.categories.filter(Boolean).sort(),
  }));
}

async function findRecentTransactions(userId, limit = 20) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  return db.collection('Plaid-Transactions')
    .find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
}

async function findDistinctMerchants(userId) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const results = await db.collection('Plaid-Transactions').distinct('merchant_name', {
    userId,
    merchant_name: { $exists: true, $ne: null },
  });
  return results.sort();
}

async function findSimilarTransactionGroupsByName(uid) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const pipeline = [
    { $match: { userId: uid } },
    { $limit: 1000 },
    { $group: { _id: '$name', count: { $sum: 1 }, transactions: { $push: '$$ROOT' } } },
    { $match: { count: { $gte: 2 } } },
    { $sort: { count: -1 } },
  ];
  return db.collection('Plaid-Transactions').aggregate(pipeline, { allowDiskUse: true }).toArray();
}

async function findSimilarTransactionGroupsByCategory(uid) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  const pipeline = [
    { $match: { userId: uid } },
    { $group: { _id: '$category', count: { $sum: 1 }, names: { $push: '$name' } } },
    { $sort: { count: -1 } },
  ];
  return db.collection('Plaid-Transactions').aggregate(pipeline, { allowDiskUse: true }).toArray();
}

// ---- Compound rules (Basil-Rules collection) ----

async function findUserRules(userId) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  return db.collection('Basil-Rules').find({ userId }).sort({ createdAt: -1 }).toArray();
}

async function insertRule(rule) {
  const db = (await connectToDb()).db(process.env.DB_NAME);
  return db.collection('Basil-Rules').insertOne(rule);
}

async function updateCompoundRule(userId, ruleId, updates) {
  const { ObjectId } = require('mongodb');
  const db = (await connectToDb()).db(process.env.DB_NAME);
  return db.collection('Basil-Rules').updateOne(
    { _id: new ObjectId(ruleId), userId },
    { $set: updates }
  );
}

async function deleteCompoundRule(userId, ruleId) {
  const { ObjectId } = require('mongodb');
  const db = (await connectToDb()).db(process.env.DB_NAME);
  return db.collection('Basil-Rules').deleteOne({ _id: new ObjectId(ruleId), userId });
}

module.exports = {
  connectToDb,
  insertData,
  findDistinctMerchants,
  findMerchantsWithStats,
  findRecentTransactions,
  updateData,
  updateManyData,
  deduplicateData,
  findUnmappedData,
  deleteRemovedData,
  findFilterData,
  cleanPendingTransactions,
  findUserData,
  findSimilarTransactionGroupsByName,
  findSimilarTransactionGroupsByCategory,
  findUserRules,
  insertRule,
  updateCompoundRule,
  deleteCompoundRule,
};
