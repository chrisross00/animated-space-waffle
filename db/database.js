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
    const db = await connectToDb();
    const collection = db.collection(collectionName);
    // await collection.deleteMany({})
    await collection.insertMany(data);
    // console.log(`Database.js Message: Inserted data and closing.`);
  } catch (err) {
    console.error(err);
  }
}

async function findData(collectionName) {
  try { // add toArray() override parameter in the future
    const db = await connectToDb();
    const collection = db.collection(collectionName);
    const result = await collection.find().sort({'date': -1}).toArray();
    // console.log(`Found data: ${JSON.stringify(result)}`);
    // console.log('BE message: findData got a response from MongoDb, sending back up to API')
    return result;
  } catch (err) {
    console.error(err);
  }
}

async function findUnmappedData(collectionName) {
  try { // add toArray() override parameter in the future
    const db = await connectToDb();
    const collection = db.collection(collectionName);
    const result = await collection.find({ "mappedCategory" : { "$exists" : false } }).toArray();
    // console.log(`Found data: ${JSON.stringify(result)}`);
    // console.log('BE message: findData got a response from MongoDb, sending back up to API')
    return result;
  } catch (err) {
    console.error(err);
  }
}

async function updateData(collectionName, filter, update, options = null) {
  try {
    const db = await connectToDb();
    const collection = db.collection(collectionName);
    await collection.updateOne(filter, update, options);
    console.log(`Updated data: ${JSON.stringify(update)}`);
  } catch (err) {
    console.error(err);
  }
}

async function deduplicateData(collectionName) { // this only works for Transactions collection right now
  try {
    const db = await connectToDb();
    const collection = db.collection(collectionName);

    // Group documents by the "Transaction ID" field and count the number of occurrences
    const result = await collection.aggregate([
      {
        $group: {
          _id: { transaction_id: "$transaction_id" },
          count: { $sum: 1 },
          docs: { $push: "$_id" }
        }
      },
      // Find groups with more than one occurrence
      { $match: { count: { $gt: 1 } } },
      // Sort the results by count in descending order
      { $sort: { count: -1 } }
    ]).toArray(); // Use toArray() to convert the cursor to an array

    // Iterate through each group of duplicate documents
    let totalDocs = 0
    for (const docGroup of result) {
      // Remove all but the first occurrence of the document
      const deleteResult = await collection.deleteMany({ _id: { $in: docGroup.docs.slice(1) } });
      // console.log(deleteResult.deletedCount + ' documents deleted');
      totalDocs++;
    }

    // console.log("Database.js Message: ran deduplicateData() successfully")
    return;

  } catch (err) {
    console.error(err);
  }
}

  
  module.exports = {
    connectToDb,
    insertData,
    findData,
    updateData,
    deduplicateData,
    findUnmappedData,
  };
  