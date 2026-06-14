// api/index.js
const { withHandler } = require("../lib/http");

module.exports = withHandler(async (req, res) => {
  res.json({ status: "ZakkiPay Backend OK (Vercel Serverless)", time: new Date().toISOString() });
});
