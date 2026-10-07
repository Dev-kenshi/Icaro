import assert from "node:assert/strict";
import { once } from "node:events";
import { pool } from "@workspace/db";
import app from "./app";
import { COOKIE, issueToken } from "./lib/auth";

const eventSlug = "i-imersao-tecnologica-contabil-itcont-786544";
const server = app.listen(0, "127.0.0.1");

try {
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine the validation server address.");
  }

  const url = `http://127.0.0.1:${address.port}/api/itcont/events/${eventSlug}`;
  const unauthorized = await fetch(url);
  assert.equal(unauthorized.status, 401, "event route must require a session");

  const cookie = `${COOKIE}=${issueToken("user1", "user")}`;
  const response = await fetch(url, { headers: { cookie } });
  assert.equal(response.status, 200, "signed-in user should be able to read the event");

  const data = await response.json() as {
    event: {
      slug: string;
      startsOn: string;
      endsOn: string;
      bannerUrl: string;
      logoUrl: string;
    };
    sessions: unknown[];
    guests: { name: string; imageUrl: string }[];
    registrationCategories: { priceCents: number }[];
  };
  assert.equal(data.event.slug, eventSlug);
  assert.equal(data.event.startsOn, "2026-10-21");
  assert.equal(data.event.endsOn, "2026-10-22");
  assert.ok(data.event.bannerUrl.startsWith("https://images.even3.com/"));
  assert.ok(data.event.logoUrl.startsWith("https://images.even3.com/"));
  assert.equal(data.sessions.length, 3);
  assert.equal(data.guests.length, 7);
  assert.ok(data.guests.some((guest) => guest.name === "André Dedeko"));
  assert.ok(data.guests.every((guest) => guest.imageUrl.startsWith("https://images.even3.com/")));
  assert.equal(data.registrationCategories.length, 3);
  assert.ok(data.registrationCategories.every((category) => category.priceCents === 0));

  const missing = await fetch(`${url}-missing`, { headers: { cookie } });
  assert.equal(missing.status, 404, "unknown event slugs should return 404");

  console.info("ITCONT API validation passed.");
} finally {
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await pool.end();
}
