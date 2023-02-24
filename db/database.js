const { MongoClient } = require('mongodb');
// const dbUri = process.env.DB_URI
// const dbName = process.env.DB_NAME


// Connect to Mongo
async function connectToDb() {
  const client = new MongoClient(process.env.DB_URI);
  await client.connect();
  return client.db(process.env.DB_NAME);
}
  
async function insertData(collectionName, data) {
  try {
    const db = client.db('<database>');
    const collection = db.collection(collectionName);
    await collection.insertOne(data);
    console.log(`Inserted data: ${JSON.stringify(data)}`);
  } catch (err) {
    console.error(err);
  }
}

async function findData(collectionName, query) {
  try {
    const dbName = process.env.DB_NAME
    const db = await connectToDb();
    const collection = db.collection(collectionName);
    const result = await collection.find().sort({Date:-1}).toArray();
    // console.log(`Found data: ${JSON.stringify(result)}`);
    console.log('BE message: got a response from MongoDb, sending back up to API')
    return result;
  } catch (err) {
    console.error(err);
  }
}

async function updateData(collectionName, filter, update) {
  try {
    const db = client.db('<database>');
    const collection = db.collection(collectionName);
    await collection.updateOne(filter, { $set: update });
    console.log(`Updated data: ${JSON.stringify(update)}`);
  } catch (err) {
    console.error(err);
  }
}
  
  module.exports = {
    connectToDb,
    insertData,
    findData,
    updateData,
  };
  