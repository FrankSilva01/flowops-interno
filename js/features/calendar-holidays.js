const MOVABLE_DATES = {
  2025: { carnival: "03-04", goodFriday: "04-18", mothersDay: "05-11" },
  2026: { carnival: "02-17", goodFriday: "04-03", mothersDay: "05-10" },
  2027: { carnival: "02-09", goodFriday: "03-26", mothersDay: "05-09" },
  2028: { carnival: "02-29", goodFriday: "04-14", mothersDay: "05-14" },
  2029: { carnival: "02-13", goodFriday: "03-30", mothersDay: "05-13" },
  2030: { carnival: "03-05", goodFriday: "04-19", mothersDay: "05-12" },
};

export const CALENDAR_HOLIDAYS = Object.freeze(Object.fromEntries(
  Object.entries(MOVABLE_DATES).flatMap(([year, dates]) => [
    [`${year}-01-01`, "🎉 Ano Novo"],
    [`${year}-${dates.carnival}`, "🎭 Carnaval"],
    [`${year}-${dates.goodFriday}`, "✝️ Sexta-feira Santa"],
    [`${year}-04-21`, "🏛️ Tiradentes"],
    [`${year}-05-01`, "🏢 Dia do Trabalho"],
    [`${year}-${dates.mothersDay}`, "💐 Dia das Mães"],
    [`${year}-05-31`, "📋 DASN-SIMEI (Declaração MEI)"],
    [`${year}-06-24`, "🎪 São João"],
    [`${year}-09-07`, "🌳 Independência"],
    [`${year}-10-12`, "👑 N. Sra. Aparecida / Dia das Crianças"],
    [`${year}-11-02`, "Finados"],
    [`${year}-11-15`, "🏛️ Proclamação da República"],
    [`${year}-11-20`, "Consciência Negra"],
    [`${year}-12-25`, "🎄 Natal"],
  ]),
));
