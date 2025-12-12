export class TransactionWrapper {
    private connection: any; // Replace with actual type for your database connection

    constructor(connection: any) {
        this.connection = connection;
    }

    async beginTransaction() {
        await this.connection.beginTransaction();
    }

    async commitTransaction() {
        await this.connection.commit();
    }

    async rollbackTransaction() {
        await this.connection.rollback();
    }

    async executeInTransaction<T>(operation: () => Promise<T>): Promise<T> {
        try {
            await this.beginTransaction();
            const result = await operation();
            await this.commitTransaction();
            return result;
        } catch (error) {
            await this.rollbackTransaction();
            throw error;
        }
    }
}