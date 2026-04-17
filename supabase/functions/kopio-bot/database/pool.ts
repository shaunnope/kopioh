import { Pool } from "postgres";
import { config } from "../config.ts";

const { username, password, hostname, port, pathname } = new URL(config.DB_URL);

export const pool = new Pool(
  {
    user: username,
    password,
    hostname,
    port: Number(port),
    database: pathname.slice(1),
    tls: { enabled: true, enforce: false },
  },
  3,
  true,
);