import { asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetItcontEventParams,
  GetItcontEventResponse,
} from "@workspace/api-zod";
import {
  db,
  itcontEvents,
  itcontEventGuests,
  itcontEventSessions,
  itcontRegistrationCategories,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/itcont/events/:slug", async (req, res): Promise<void> => {
  const params = GetItcontEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identificador do evento inválido." });
    return;
  }

  const [event] = await db
    .select()
    .from(itcontEvents)
    .where(eq(itcontEvents.slug, params.data.slug))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "Evento não encontrado." });
    return;
  }
  if (!event.bannerUrl || !event.logoUrl) {
    throw new Error("ITCONT event image URLs are missing from the database.");
  }

  const [sessions, guests, registrationCategories] = await Promise.all([
    db
      .select()
      .from(itcontEventSessions)
      .where(eq(itcontEventSessions.eventId, event.id))
      .orderBy(asc(itcontEventSessions.eventDate), asc(itcontEventSessions.sortOrder)),
    db
      .select()
      .from(itcontEventGuests)
      .where(eq(itcontEventGuests.eventId, event.id))
      .orderBy(asc(itcontEventGuests.sortOrder)),
    db
      .select()
      .from(itcontRegistrationCategories)
      .where(eq(itcontRegistrationCategories.eventId, event.id))
      .orderBy(asc(itcontRegistrationCategories.sortOrder)),
  ]);

  const response = GetItcontEventResponse.parse({
    event: {
      slug: event.slug,
      title: event.title,
      summary: event.summary,
      description: event.description,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      timezone: event.timezone,
      venue: event.venue,
      address: event.address,
      city: event.city,
      state: event.state,
      country: event.country,
      organizerName: event.organizerName,
      organizingProject: event.organizingProject,
      bannerUrl: event.bannerUrl,
      logoUrl: event.logoUrl,
      sourceUrl: event.sourceUrl,
      updatedAt: event.updatedAt,
    },
    sessions: sessions.map((session) => ({
      date: session.eventDate,
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      sortOrder: session.sortOrder,
    })),
    guests: guests.map((guest) => {
      if (!guest.imageUrl) {
        throw new Error(`ITCONT guest image URL is missing for ${guest.name}.`);
      }
      return {
        name: guest.name,
        imageUrl: guest.imageUrl,
        sortOrder: guest.sortOrder,
      };
    }),
    registrationCategories: registrationCategories.map((category) => ({
      name: category.name,
      priceCents: category.priceCents,
      currency: category.currency,
      availableUntil: category.availableUntil,
      registrationUrl: category.registrationUrl,
      sortOrder: category.sortOrder,
    })),
  });

  res.json(response);
});

export default router;
