const { MongoClient } = require('mongodb');
// const dbUri = process.env.DB_URI
// const dbName = process.env.DB_NAME


// Connect to Mongo
async function connectToDb() {
  const client = new MongoClient(process.env.DB_URI);
  await client.connect();
  console.log('  DB: setting up new database connection...')
  return client //.db(process.env.DB_NAME);
}
  
async function insertData(collectionName, data) {
  let client;
  try {
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    const collection = db.collection(collectionName);

    // if data is an array, insert each item in the array
    if (Array.isArray(data)){
      const dataWithInsertDate = data.map(item => {
        return { ...item, insertDate: Date.now() };
      });
      await collection.insertMany(dataWithInsertDate);
      console.log(`  DB: Inserted data and closing.`);
      return;
    // else, if its an object (a user account), insert just the object
    } else if (typeof data === 'object') {
      data.insertDate = Date.now();
      await collection.insertOne(data);
      console.log(`  DB: Inserted data and closing.`);
      return;
    } else {
      // handle the case where data is neither an array nor an object
      console.error('Invalid data type');
      return;
    }
  } catch (err) {
    console.error('  DB: ',err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by insertData().")
    }
  }
}

async function findData(collectionName) {
  let client;
  try { // add toArray() override parameter in the future
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    const collection = db.collection(collectionName);
    const result = await collection.find().sort({date: -1}).toArray();
    return result;
  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by findData()")
    }
  }
}

async function findUserData(collectionName, uid) {
  let client;
  try { // add toArray() override parameter in the future
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    const collection = db.collection(collectionName);
    const query = { userId: uid };
    const result = await collection.find(query).sort({date: -1}).toArray();
    return result;
  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by findData()")
    }
  }
}

async function findFilterData(collectionName, filter) {
  let client;
  try { // add toArray() override parameter in the future
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    const collection = db.collection(collectionName);
    let foundResults = []
    for (const element of filter) {
      let findFilter = { ['transaction_id']: element.transaction_id, ['pending']: true }
      const result = await collection.find(findFilter).sort({date: -1}).toArray();
      foundResults.push(...result)
      // console.log('DB - found filtered item: ', JSON.stringify(result))
    }
    return foundResults;
  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by findFilterData().")
    }
  }
}

async function findUnmappedData(collectionName) {
  let client;
  try { // add toArray() override parameter in the future
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    const collection = db.collection(collectionName);
    const result = await collection.find({ "mappedCategory" : { "$exists" : false } }).toArray();
    // console.log(`Found data: ${JSON.stringify(result)}`);
    // console.log('BE message: findData got a response from MongoDb, sending back up to API')
    return result;
  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed.")
    }
  }
}

async function updateData(collectionName, filter, update, options = null) {
  let client;
  try {
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    const collection = db.collection(collectionName);
    await collection.updateOne(filter, update, options);
    console.log(`Updated data: ${JSON.stringify(update)}`);
  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by findUnmappedData().")
    }
  }
}

async function deduplicateData(collectionName) { // this only works for Transactions collection right now
  let client;
  try {
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
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

  console.log("Database.js Message: ran deduplicateData() successfully")
    return;

  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by deduplicateData().")
    }
  }
}

async function deleteRemovedData(collectionName, filter) { // for when Plaid removedTransactions array is not empty
  let client;
  try { // add toArray() override parameter in the future
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    const collection = db.collection(collectionName);
    const result = await collection.deleteMany(filter)


    // for (const element of filter) {
    //   let deleteFilter = { ['transaction_id']: element.transaction_id, ['pending']: true }
    //   const result = await collection.find(deleteFilter).sort({date: -1}).toArray();
    //   console.log('DB - found filtered item: ', result)
    // }
    
    return result;
  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by deleteRemovedData().")
    }
  }
}

async function cleanPendingTransactions(collectionName) {
  console.log('cleaning pending transactions')
  let client;
  try { // add toArray() override parameter in the future
    client = await connectToDb();
    const db = client.db(process.env.DB_NAME)
    // const collection = db.collection('Plaid-Transactions');
    const collection = db.collection(collectionName);

    // get the transaction_ids from the db where pending = true
    let allPendingTransactions = []
    let findFilter = {['pending']: true}
    const allPendingResults = await collection.find(findFilter).toArray();
    allPendingTransactions.push(...allPendingResults)
    
    let allPendingTransactionIds = {
        $or: allPendingTransactions.map(transaction => {
          return {
            $and: [
              { pending_transaction_id: transaction.transaction_id },
              { pending: false }
            ]
          };
        })
      };
      
    const keeperTransactions = await collection.find(allPendingTransactionIds).toArray();
    const transactionIdsToRemove = new Set(keeperTransactions.map(t => t.pending_transaction_id));
    const deleterFilter = {
      transaction_id: { $in: [...transactionIdsToRemove] }
    };
    const result = await collection.deleteMany(deleterFilter)
    console.log('final transactions to delete', result)

    return result;
  } catch (err) {
    console.error(err);
  } finally {
    if (client) {
      await client.close();
      console.log("  DB: database connection closed by cleanPendingTransactions().")
    }
  }
}
  
  module.exports = {
    connectToDb,
    insertData,
    findData,
    updateData,
    deduplicateData,
    findUnmappedData,
    deleteRemovedData,
    findFilterData,
    cleanPendingTransactions,
    findUserData
  };
  