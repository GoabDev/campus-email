const cors = require("cors");
const express = require("express");
const path = require("path");
const apiRoutes = require("./routes");
const { clientDistPath, uploadsPath } = require("./config/paths");
const { errorHandler, notFound } = require("./middlewares/error.middleware");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(uploadsPath));
  app.use("/api", apiRoutes);
  app.use(notFound);

  app.use(express.static(clientDistPath));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });

  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
