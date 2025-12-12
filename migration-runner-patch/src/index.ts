import { createConnection } from './db/connection';
import { MigrationRunner } from './runner/migrationRunner';
import { SafeExecutor } from './runner/safeExecutor';
import { TransactionWrapper } from './runner/transactionWrapper';

async function main() {
    try {
        const connection = await createConnection();
        const transactionWrapper = new TransactionWrapper(connection);
        const safeExecutor = new SafeExecutor();

        const migrationRunner = new MigrationRunner(transactionWrapper, safeExecutor);
        await migrationRunner.runMigrations();
    } catch (error) {
        console.error('Error initializing migration runner:', error);
    }
}

main();