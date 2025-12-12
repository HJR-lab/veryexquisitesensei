import { SafeExecutor } from '../runner/safeExecutor';
import { TransactionWrapper } from '../runner/transactionWrapper';

export function splitData(data: any[], chunkSize: number): any[][] {
    const result: any[][] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
        result.push(data.slice(i, i + chunkSize));
    }
    return result;
}

export async function executeWithTransaction(data: any[], chunkSize: number, executeFunction: (chunk: any[]) => Promise<void>): Promise<void> {
    const transactionWrapper = new TransactionWrapper();
    const safeExecutor = new SafeExecutor();

    const chunks = splitData(data, chunkSize);
    for (const chunk of chunks) {
        await safeExecutor.execute(async () => {
            await transactionWrapper.begin();
            try {
                await executeFunction(chunk);
                await transactionWrapper.commit();
            } catch (error) {
                await transactionWrapper.rollback();
                throw error;
            }
        });
    }
}