import { MigrationRunner } from '../src/runner/migrationRunner';
import { SafeExecutor } from '../src/runner/safeExecutor';
import { TransactionWrapper } from '../src/runner/transactionWrapper';

describe('MigrationRunner', () => {
    let migrationRunner: MigrationRunner;
    let safeExecutor: SafeExecutor;
    let transactionWrapper: TransactionWrapper;

    beforeEach(() => {
        safeExecutor = new SafeExecutor();
        transactionWrapper = new TransactionWrapper();
        migrationRunner = new MigrationRunner(safeExecutor, transactionWrapper);
    });

    it('should execute migrations successfully', async () => {
        const mockMigration = jest.fn().mockResolvedValue(true);
        migrationRunner.addMigration(mockMigration);

        await migrationRunner.run();

        expect(mockMigration).toHaveBeenCalled();
    });

    it('should handle migration errors gracefully', async () => {
        const mockMigration = jest.fn().mockRejectedValue(new Error('Migration failed'));
        migrationRunner.addMigration(mockMigration);

        await expect(migrationRunner.run()).rejects.toThrow('Migration failed');
        expect(mockMigration).toHaveBeenCalled();
    });

    it('should rollback transaction on migration failure', async () => {
        const mockMigration = jest.fn().mockRejectedValue(new Error('Migration failed'));
        migrationRunner.addMigration(mockMigration);

        await expect(migrationRunner.run()).rejects.toThrow('Migration failed');
        expect(transactionWrapper.rollback).toHaveBeenCalled();
    });

    it('should commit transaction on successful migration', async () => {
        const mockMigration = jest.fn().mockResolvedValue(true);
        migrationRunner.addMigration(mockMigration);

        await migrationRunner.run();

        expect(transactionWrapper.commit).toHaveBeenCalled();
    });
});