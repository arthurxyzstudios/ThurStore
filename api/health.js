// api/health.js
const { withHandler } = require("../lib/http");

module.exports = withHandler(async (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});
