const app = require('./app');
const { connectToDb } = require('./database');

require('dotenv').config()

const port = process.env.PORT

const db = connectToDb().then(() => {
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});