import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const itcontEvents = pgTable(
  "itcont_events",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    timezone: text("timezone").notNull(),
    venue: text("venue").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    country: text("country").notNull(),
    organizerName: text("organizer_name").notNull(),
    organizingProject: text("organizing_project").notNull(),
    bannerUrl: text("banner_url").notNull(),
    logoUrl: text("logo_url").notNull(),
    sourceUrl: text("source_url").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("itcont_events_slug_uq").on(table.slug)],
);

export const itcontEventSessions = pgTable(
  "itcont_event_sessions",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => itcontEvents.id, { onDelete: "cascade" }),
    eventDate: date("event_date", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("itcont_event_sessions_event_date_title_uq").on(
      table.eventId,
      table.eventDate,
      table.title,
    ),
  ],
);

export const itcontEventGuests = pgTable(
  "itcont_event_guests",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => itcontEvents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    imageUrl: text("image_url").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("itcont_event_guests_event_name_uq").on(
      table.eventId,
      table.name,
    ),
  ],
);

export const itcontRegistrationCategories = pgTable(
  "itcont_registration_categories",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => itcontEvents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull(),
    availableUntil: date("available_until", { mode: "string" }).notNull(),
    registrationUrl: text("registration_url").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("itcont_registration_categories_event_name_uq").on(
      table.eventId,
      table.name,
    ),
  ],
);

export const insertItcontEventSchema = createInsertSchema(itcontEvents).omit({
  id: true,
  updatedAt: true,
});
export const insertItcontEventSessionSchema = createInsertSchema(
  itcontEventSessions,
).omit({ id: true });
export const insertItcontEventGuestSchema = createInsertSchema(
  itcontEventGuests,
).omit({ id: true });
export const insertItcontRegistrationCategorySchema = createInsertSchema(
  itcontRegistrationCategories,
).omit({ id: true });

export type InsertItcontEvent = z.infer<typeof insertItcontEventSchema>;
export type InsertItcontEventSession = z.infer<
  typeof insertItcontEventSessionSchema
>;
export type InsertItcontEventGuest = z.infer<
  typeof insertItcontEventGuestSchema
>;
export type InsertItcontRegistrationCategory = z.infer<
  typeof insertItcontRegistrationCategorySchema
>;

export type ItcontEvent = typeof itcontEvents.$inferSelect;
export type ItcontEventSession = typeof itcontEventSessions.$inferSelect;
export type ItcontEventGuest = typeof itcontEventGuests.$inferSelect;
export type ItcontRegistrationCategory =
  typeof itcontRegistrationCategories.$inferSelect;
