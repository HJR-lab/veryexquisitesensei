import { SafeExecutor } from '../src/runner/safeExecutor';

describe('SafeExecutor', () => {
    let safeExecutor: SafeExecutor;

    beforeEach(() => {
        safeExecutor = new SafeExecutor();
    });

    test('should execute a function successfully', async () => {
        const result = await safeExecutor.execute(async () => {
            return 'Success';
        });
        expect(result).toBe('Success');
    });

    test('should handle errors gracefully', async () => {
        const result = await safeExecutor.execute(async () => {
            throw new Error('Test Error');
        });
        expect(result).toBeUndefined();
        // You can also check for logs or other side effects if necessary
    });

    test('should execute multiple functions in sequence', async () => {
        const results = [];
        await safeExecutor.execute(async () => {
            results.push('First');
        });
        await safeExecutor.execute(async () => {
            results.push('Second');
        });
        expect(results).toEqual(['First', 'Second']);
    });

    test('should not stop execution on error in a sequence', async () => {
        const results = [];
        await safeExecutor.execute(async () => {
            results.push('First');
        });
        await safeExecutor.execute(async () => {
            throw new Error('Test Error');
        });
        await safeExecutor.execute(async () => {
            results.push('Second');
        });
        expect(results).toEqual(['First', 'Second']);
    });
});