import { createConnection, ConnectionOptions } from 'typeorm';

const connectionOptions: ConnectionOptions = {
    type: 'postgres', // or your database type
    host: 'localhost',
    port: 5432,
    username: 'your_username',
    password: 'your_password',
    database: 'your_database',
    synchronize: false,
    logging: false,
    entities: [
        // specify your entities here
    ],
};

export const connectToDatabase = async () => {
    try {
        const connection = await createConnection(connectionOptions);
        console.log('Database connection established successfully.');
        return connection;
    } catch (error) {
        console.error('Error connecting to the database:', error);
        throw error;
    }
};