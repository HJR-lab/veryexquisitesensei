import { SafeExecutor } from './safeExecutor';
import { TransactionWrapper } from './transactionWrapper';

export class MigrationRunner {
    private safeExecutor: SafeExecutor;
    private transactionWrapper: TransactionWrapper;

    constructor() {
        this.safeExecutor = new SafeExecutor();
        this.transactionWrapper = new TransactionWrapper();
    }

    public async runMigrations(migrations: Array<() => Promise<void>>): Promise<void> {
        await this.transactionWrapper.begin();

        try {
            for (const migration of migrations) {
                await this.safeExecutor.execute(migration);
            }
            await this.transactionWrapper.commit();
        } catch (error) {
            await this.transactionWrapper.rollback();
            throw error;
        }
    }

    public async getMigrationStatus(): Promise<any> {
        // Logic to retrieve migration status
    }

    // Additional methods for managing migration states can be added here
}