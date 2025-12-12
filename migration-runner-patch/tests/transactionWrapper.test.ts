import { TransactionWrapper } from '../src/runner/transactionWrapper';
import { DatabaseConnection } from '../src/db/connection';
import { Transaction } from '../src/db/transaction';

describe('TransactionWrapper', () => {
    let transactionWrapper: TransactionWrapper;
    let mockConnection: DatabaseConnection;
    let mockTransaction: Transaction;

    beforeEach(() => {
        mockConnection = new DatabaseConnection();
        mockTransaction = new Transaction(mockConnection);
        transactionWrapper = new TransactionWrapper(mockTransaction);
    });

    it('should begin a transaction', async () => {
        await transactionWrapper.begin();
        expect(mockTransaction.isActive()).toBe(true);
    });

    it('should commit a transaction', async () => {
        await transactionWrapper.begin();
        await transactionWrapper.commit();
        expect(mockTransaction.isCommitted()).toBe(true);
    });

    it('should rollback a transaction on error', async () => {
        await transactionWrapper.begin();
        try {
            await transactionWrapper.execute(() => {
                throw new Error('Test error');
            });
        } catch (error) {
            expect(mockTransaction.isRolledBack()).toBe(true);
        }
    });

    it('should execute a function within a transaction', async () => {
        let executed = false;
        await transactionWrapper.begin();
        await transactionWrapper.execute(() => {
            executed = true;
        });
        expect(executed).toBe(true);
        expect(mockTransaction.isCommitted()).toBe(true);
    });
});