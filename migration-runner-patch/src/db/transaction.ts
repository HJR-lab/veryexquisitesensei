export class Transaction {
    private connection: any; // Replace with actual connection type

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

    async executeInTransaction(execute: () => Promise<void>) {
        try {
            await this.beginTransaction();
            await execute();
            await this.commitTransaction();
        } catch (error) {
            await this.rollbackTransaction();
            throw error;
        }
    }
}