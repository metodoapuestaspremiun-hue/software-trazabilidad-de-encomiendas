const mysql = require('mysql2/promise');

async function fix() {
  const p = mysql.createPool({
    host: 'mysql.us.stackcp.com',
    port: 46229,
    user: 'mvpcoperativacariamg-3139327eb2',
    password: 'WC4gtnP1snT2',
    database: 'mvpcoperativacariamg-3139327eb2',
  });

  const [res] = await p.query(
    "UPDATE viaje SET estado = 'cerrado' WHERE id = 'aa4e900f-e06c-11f1-a958-78ac4432fe0b'"
  );
  console.log('Update result:', res);
  await p.end();
}

fix().catch(err => {
  console.error(err);
  process.exit(1);
});
