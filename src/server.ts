/**
 * Server bootstrap
 *
 * Loads environment variables and starts the HTTP server using the
 * Express application configured in `app.ts`. The `PORT` environment
 * variable controls the listening port (default 3000).
 */
import dotenv from "dotenv";
dotenv.config();

import app from "./app";

const PORT = process.env.PORT || 3030;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
