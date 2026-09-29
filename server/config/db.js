const { db } = require('../database/database');

const connectDB = async () => {
  try {
    console.log(`[SQLite Database] Ready to serve queries`);
  } catch (error) {
    console.error(`[SQLite Database] Connection Error: ${error.message}`);
  }
};

module.exports = connectDB;
