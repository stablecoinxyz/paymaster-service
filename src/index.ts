// Initialize Sentry first
require("./instrument.js");
const Sentry = require("@sentry/node");

// Then import Fastify and other dependencies
const Fastify = require("fastify");
import routes from "./routes";

async function start(port = 3000) {
  const app = Fastify({});
  
  // Set up Sentry error handler
  Sentry.setupFastifyErrorHandler(app);

  app.register(routes, {
    prefix: "/",
  });

  await app.listen({ host: "0.0.0.0", port });
}

const PORT = Number(process.env.PORT) || 3000;

start(PORT)
  .then(() => {
    console.log(`Running on http://0.0.0.0:${PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
