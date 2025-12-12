# Migration Runner Patch

This project provides a robust migration runner for managing database migrations with enhanced safety and transactional integrity. 

## Overview

The migration runner is designed to execute database migrations in a controlled manner, ensuring that errors are handled gracefully and that the application remains stable during migration execution. The core components of the project include:

- **MigrationRunner**: The main class responsible for executing migrations and managing their states.
- **SafeExecutor**: A utility that ensures functions are executed safely, handling errors without crashing the application.
- **TransactionWrapper**: A class that manages database transactions, providing methods to begin, commit, and rollback transactions.

## Project Structure

```
migration-runner-patch
├── src
│   ├── index.ts                # Entry point for the application
│   ├── runner
│   │   ├── migrationRunner.ts   # Handles migration execution
│   │   ├── safeExecutor.ts       # Executes functions safely
│   │   └── transactionWrapper.ts  # Manages database transactions
│   ├── migrations
│   │   └── README.md            # Documentation for migrations
│   ├── db
│   │   ├── connection.ts         # Database connection setup
│   │   └── transaction.ts        # Transaction management
│   └── utils
│       └── splitter.ts          # Utility functions for data splitting
├── tests
│   ├── migrationRunner.test.ts   # Unit tests for MigrationRunner
│   ├── safeExecutor.test.ts       # Unit tests for SafeExecutor
│   └── transactionWrapper.test.ts  # Unit tests for TransactionWrapper
├── package.json                  # npm configuration
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # Project documentation
```

## Getting Started

1. **Installation**: Clone the repository and install the dependencies using npm:
   ```
   npm install
   ```

2. **Running Migrations**: Use the `MigrationRunner` class to execute your migrations. Ensure that your database connection is properly configured in `connection.ts`.

3. **Testing**: Run the tests to ensure everything is functioning as expected:
   ```
   npm test
   ```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License.