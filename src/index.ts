import { createApp } from "./app";
import { openDb } from "./db";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const db = openDb();
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Ledgerly backend listening on port ${PORT}`);
});
