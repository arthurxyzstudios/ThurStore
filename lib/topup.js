// lib/topup.js
const db = require("./db");

/**
 * Tandai topup sukses dan tambahkan saldo user secara atomik + tercatat di
 * balance_logs. Dipakai oleh /api/topup/status/[id] (polling) dan
 * /api/topup/webhook (callback dari gateway). Idempoten: aman dipanggil
 * berkali-kali untuk id_transaksi yang sama.
 */
async function settleTopup(idTransaksi) {
  return db.transaction(async (client) => {
    const fresh = (
      await client.query("SELECT * FROM topups WHERE id_transaksi = $1 FOR UPDATE", [idTransaksi])
    ).rows[0];
    if (!fresh || fresh.status === "SUCCESS") return fresh; // sudah diproses sebelumnya

    await client.query(
      "UPDATE topups SET status='SUCCESS', settled_at=NOW() WHERE id_transaksi=$1",
      [idTransaksi]
    );
    await db.adjustBalance(
      fresh.user_id,
      Number(fresh.nominal),
      "TOPUP",
      fresh.id_transaksi,
      "Top up via QRIS",
      client
    );
    return fresh;
  });
}

module.exports = { settleTopup };
