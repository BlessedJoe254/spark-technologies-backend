require("dotenv").config();
const mysql = require("mysql2/promise");

const isLocalHost = (process.env.DB_HOST || "localhost") === "localhost";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "spark_technologies",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: isLocalHost ? undefined : { rejectUnauthorized: true }
});

module.exports = pool;

