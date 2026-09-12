import { createUnoServer } from "./server.js";
import { registerUnoFlex } from "./UnoFlex.js";

const server = createUnoServer();
registerUnoFlex(server.io);

const port = Number(process.env.PORT ?? 3000);
server.http.listen(port, "0.0.0.0", () => console.log(`DBT Games server listening on port ${port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
