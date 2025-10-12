import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

app.get("/", async (req, res) => {
    const result = await pool.query("SELECT NOW()");
    res.json({ time: result.rows[0].now });
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));
