const { createApp } = require("./app");
const { host, port } = require("./config/env");

const app = createApp();

app.listen(port, host, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`LAN access: http://<your-ip>:${port}`);
});
