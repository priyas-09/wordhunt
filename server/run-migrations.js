import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
    try {
        console.log('🔄 Running database migrations...');

        // Read migration files
        const migrationsDir = path.join(process.cwd(), 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        console.log(`Found ${migrationFiles.length} migration files`);

        for (const file of migrationFiles) {
            console.log(`📄 Running migration: ${file}`);
            const migrationPath = path.join(migrationsDir, file);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            await pool.query(migrationSQL);
            console.log(`✅ Completed: ${file}`);
        }

        console.log('🎉 All migrations completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
