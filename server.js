require("dotenv").config();
const env = require("./config/env"); // This will validate the env variables
const logger = require("./utils/logger");

const app = require("./app");
const connectDB = require("./config/db");

const PORT = env.PORT;

async function startServer() {
    try {
        await connectDB();
        logger.info("db connected!");
        
        const server = app.listen(PORT, () => {
            logger.info(`The server is running on port ${PORT}`);
        });

        // Graceful shutdown helpers
        const exitHandler = () => {
            if (server) {
                server.close(() => {
                    logger.info('Server closed');
                    process.exit(1);
                });
            } else {
                process.exit(1);
            }
        };

        const unexpectedErrorHandler = (error) => {
            logger.error(error);
            exitHandler();
        };

        process.on('uncaughtException', unexpectedErrorHandler);
        process.on('unhandledRejection', unexpectedErrorHandler);

        process.on('SIGTERM', () => {
            logger.info('SIGTERM received');
            if (server) {
                server.close();
            }
        });
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
}

startServer();
