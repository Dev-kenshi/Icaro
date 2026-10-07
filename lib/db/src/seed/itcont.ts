import { db, pool } from "../index";
import {
  itcontEvents,
  itcontEventGuests,
  itcontEventSessions,
  itcontRegistrationCategories,
} from "../schema/itcont";

const sourceUrl =
  "https://www.even3.com.br/i-imersao-tecnologica-contabil-itcont-786544/";
const eventSlug = "i-imersao-tecnologica-contabil-itcont-786544";
const bannerUrl =
  "https://images.even3.com/r8RCndpF10pM-_B0T5c98u5vpvk=/1100x440/smart/https://static.even3.com/banner/ImagemdoCodex21deset.de202609_39_23.1de17c125c3e4604ae15.png";
const logoUrl =
  "https://images.even3.com/LYNI1hek0HIFo4KZJ9ACbooN8JI=/fit-in/250x250/smart/https://static.even3.com/logos/ImagemdoCodex21deset.de202609_39_23.91a8f584302f4c68b0fa.png";

async function seedItcontEvent() {
  await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(itcontEvents)
      .values({
        slug: eventSlug,
        title: "I IMERSÃO TECNOLÓGICA CONTÁBIL - ITCONT",
        summary:
          "Imersão da UEFS sobre inteligência artificial, tecnologia e transformação da contabilidade.",
        description:
          "A I Imersão Tecnológica Contábil da UEFS reúne estudantes, professores e profissionais para explorar como a inteligência artificial e as tecnologias digitais estão transformando a atuação contábil e a gestão dos negócios. Realizado pelo Projeto de Extensão Contador do Amanhã, o evento promove aprendizado e troca de experiências entre universidade e mercado.",
        startsOn: "2026-10-21",
        endsOn: "2026-10-22",
        timezone: "America/Sao_Paulo",
        venue: "Auditório III do Módulo IV da UEFS",
        address: "UEFS - Módulo 4",
        city: "Feira de Santana",
        state: "Bahia",
        country: "Brasil",
        organizerName: "Rômulo Benício Lucena Filho",
        organizingProject: "Projeto de Extensão Contador do Amanhã",
        bannerUrl,
        logoUrl,
        sourceUrl,
      })
      .onConflictDoUpdate({
        target: itcontEvents.slug,
        set: {
          title: "I IMERSÃO TECNOLÓGICA CONTÁBIL - ITCONT",
          summary:
            "Imersão da UEFS sobre inteligência artificial, tecnologia e transformação da contabilidade.",
          description:
            "A I Imersão Tecnológica Contábil da UEFS reúne estudantes, professores e profissionais para explorar como a inteligência artificial e as tecnologias digitais estão transformando a atuação contábil e a gestão dos negócios. Realizado pelo Projeto de Extensão Contador do Amanhã, o evento promove aprendizado e troca de experiências entre universidade e mercado.",
          startsOn: "2026-10-21",
          endsOn: "2026-10-22",
          timezone: "America/Sao_Paulo",
          venue: "Auditório III do Módulo IV da UEFS",
          address: "UEFS - Módulo 4",
          city: "Feira de Santana",
          state: "Bahia",
          country: "Brasil",
          organizerName: "Rômulo Benício Lucena Filho",
          organizingProject: "Projeto de Extensão Contador do Amanhã",
          bannerUrl,
          logoUrl,
          sourceUrl,
          updatedAt: new Date(),
        },
      })
      .returning({ id: itcontEvents.id });

    if (!event) throw new Error("ITCONT event upsert returned no row");
    const eventId = event.id;

    const sessions = [
      {
        eventDate: "2026-10-21",
        title: "Uso da Inteligência Artificial na Rotina Contábil",
        startsAt: "19:00:00",
        endsAt: "21:00:00",
        sortOrder: 1,
      },
      {
        eventDate: "2026-10-22",
        title: "Bate-Papo Tecnológico Contábil",
        startsAt: "19:00:00",
        endsAt: "20:00:00",
        sortOrder: 2,
      },
      {
        eventDate: "2026-10-22",
        title: "Inteligência Artificial e Inovação como Estratégia Empresarial",
        startsAt: "20:00:00",
        endsAt: "21:30:00",
        sortOrder: 3,
      },
    ];

    for (const session of sessions) {
      await tx
        .insert(itcontEventSessions)
        .values({ eventId, ...session })
        .onConflictDoUpdate({
          target: [
            itcontEventSessions.eventId,
            itcontEventSessions.eventDate,
            itcontEventSessions.title,
          ],
          set: {
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            sortOrder: session.sortOrder,
          },
        });
    }

    const guests = [
      {
        name: "André Dedeko",
        imageUrl:
          "https://images.even3.com/Pfs0OmLNmC7oasHh-6du61rrKRQ=/150x150/smart/https://static.even3.com/geral/AndrDedeko.041f4a39b488448d9c94.jpeg",
      },
      {
        name: "Anna Clara",
        imageUrl:
          "https://images.even3.com/QoVHgT2YRPt5QOtxYMVtL0gds0Q=/150x150/smart/https://static.even3.com/geral/WhatsAppImage2026-09-18at12.34.31.f3e37ca6fd6d4eea8b26.jpeg",
      },
      {
        name: "Luana Ávilla",
        imageUrl:
          "https://images.even3.com/awRm1PQPEw9qJ353rr6CG896Gx0=/150x150/smart/https://static.even3.com/geral/WhatsAppImage2026-09-21at08.30.19.f1c63848e83d41aea996.jpeg",
      },
      {
        name: "Matheus Neris",
        imageUrl:
          "https://images.even3.com/nIW1oK7NSvjcy--eDYrzVd1WOGM=/150x150/smart/https://static.even3.com/geral/IMG_3970.jpg.5774285325614bcc8069.jpeg",
      },
      {
        name: "Rízia Ríos",
        imageUrl:
          "https://images.even3.com/5rKdkwF9B3hFPqnM_HW2eQj72qM=/150x150/smart/https://static.even3.com/geral/RziaRos.3b83151459a049a6a541.jpeg",
      },
      {
        name: "Rômulo Benício",
        imageUrl:
          "https://images.even3.com/yynrGTJj7vGQcByACRzw7YB2_Vg=/150x150/smart/https://static.even3.com/geral/ImagemdoCodex21deset.de202611_13_05.39b256fc49dd45ae92d2.png",
      },
      {
        name: "Ângelo Loula",
        imageUrl:
          "https://images.even3.com/GvPLSfitDLHKinWEH0fRJQiRr54=/150x150/smart/https://static.even3.com/geral/AngeloLoula.04b03229b6ca4a79b89e.jpeg",
      },
    ];
    for (const [index, guest] of guests.entries()) {
      await tx
        .insert(itcontEventGuests)
        .values({
          eventId,
          name: guest.name,
          imageUrl: guest.imageUrl,
          sortOrder: index + 1,
        })
        .onConflictDoUpdate({
          target: [itcontEventGuests.eventId, itcontEventGuests.name],
          set: { imageUrl: guest.imageUrl, sortOrder: index + 1 },
        });
    }

    const categories = ["Graduação", "Docente", "Profissional Contábil"];
    for (const [index, name] of categories.entries()) {
      await tx
        .insert(itcontRegistrationCategories)
        .values({
          eventId,
          name,
          priceCents: 0,
          currency: "BRL",
          availableUntil: "2026-10-22",
          registrationUrl: sourceUrl,
          sortOrder: index + 1,
        })
        .onConflictDoUpdate({
          target: [
            itcontRegistrationCategories.eventId,
            itcontRegistrationCategories.name,
          ],
          set: {
            priceCents: 0,
            currency: "BRL",
            availableUntil: "2026-10-22",
            registrationUrl: sourceUrl,
            sortOrder: index + 1,
          },
        });
    }
  });
}

try {
  await seedItcontEvent();
  console.info("ITCONT public event data seeded.");
} catch (error) {
  console.error(
    "Failed to seed ITCONT public event data:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
