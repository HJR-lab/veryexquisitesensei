class SafeExecutor {
    static async execute(fn: () => Promise<void>): Promise<void> {
        try {
            await fn();
        } catch (error) {
            console.error("An error occurred during execution:", error);
            // Handle error gracefully, possibly logging or notifying
        }
    }
}

export default SafeExecutor;