/**
 * Default email templates for Mentor platform.
 * Used when tenant owner hasn't configured custom templates.
 *
 * Available placeholders:
 *   {firstName}  — recipient's first name
 *   {tenantName} — tenant/organization name
 *   {link}       — action URL (invite link, reset link, etc.)
 */
export const EMAIL_DEFAULTS = {
  sl: {
    // ── Invite ─────────────────────────────────────────────────────────
    inviteSubject: "Povabilo v {tenantName}",
    inviteBody: [
      "Pozdravljeni {firstName},",
      "",
      "Dodani ste bili v platformo {tenantName}.",
      "",
      "Za aktivacijo računa kliknite spodnjo povezavo in nastavite geslo:",
      "{link}",
      "",
      "Povezava velja 7 dni.",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Password reset ─────────────────────────────────────────────────
    resetSubject: "Ponastavitev gesla – {tenantName}",
    resetBody: [
      "Pozdravljeni {firstName},",
      "",
      "Zahtevali ste ponastavitev gesla.",
      "",
      "Kliknite spodnjo povezavo:",
      "{link}",
      "",
      "Povezava velja 1 uro. Če niste zahtevali ponastavitve, ignorirajte to sporočilo.",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Security: password changed ─────────────────────────────────────
    passwordChangedSubject: "Geslo spremenjeno – {tenantName}",
    passwordChangedBody: [
      "Pozdravljeni {firstName},",
      "",
      "Vaše geslo za {tenantName} je bilo pravkar spremenjeno.",
      "",
      "Če tega niste storili vi, se takoj obrnite na skrbnika platforme.",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Security: email changed ────────────────────────────────────────
    emailChangedSubject: "Email naslov spremenjen – {tenantName}",
    emailChangedBody: [
      "Pozdravljeni {firstName},",
      "",
      "Email naslov za vaš račun v {tenantName} je bil spremenjen.",
      "",
      "Če tega niste storili vi, se takoj obrnite na skrbnika platforme.",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: mentor received question ─────────────────────────
    mentorQuestionSubject: "Novo vprašanje – {moduleTitle}",
    mentorQuestionBody: [
      "Pozdravljeni {firstName},",
      "",
      "V modulu \"{moduleTitle}\" ste prejeli novo vprašanje od {senderName}:",
      "",
      "\"{messagePreview}\"",
      "",
      "Odgovorite prek platforme:",
      "{link}",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: live training reminder ───────────────────────────
    liveReminderSubject: "Opomnik: {eventTitle} – {startsAt}",
    liveReminderBody: [
      "Pozdravljeni {firstName},",
      "",
      "Opomnik za usposabljanje v živo:",
      "",
      "  {eventTitle}",
      "  Datum in ura: {startsAt}",
      "  Povezava: {meetUrl}",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: new knowledge digest ─────────────────────────────
    knowledgeDigestSubject: "Nova znanja v {tenantName}",
    knowledgeDigestBody: [
      "Pozdravljeni {firstName},",
      "",
      "V platformi {tenantName} so bila dodana nova znanja:",
      "",
      "{moduleList}",
      "",
      "Prijavite se za ogled:",
      "{link}",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: new knowledge instant ────────────────────────────
    knowledgeInstantSubject: "Novo znanje: {moduleTitle}",
    knowledgeInstantBody: [
      "Pozdravljeni {firstName},",
      "",
      "V platformi {tenantName} je bilo dodano novo znanje:",
      "",
      "  {moduleTitle}",
      "",
      "Oglejte si ga:",
      "{link}",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: live event created ─────────────────────────────
    liveCreatedSubject: "Nov termin: {eventTitle} – {startsAt}",
    liveCreatedBody: [
      "Pozdravljeni {firstName},",
      "",
      "Razpisan je nov termin usposabljanja v živo:",
      "",
      "  {eventTitle}",
      "  Datum in ura: {startsAt}",
      "  Povezava: {meetUrl}",
      "",
      "Lep pozdrav,",
      "{tenantName}",
    ].join("\n"),
  },

  en: {
    // ── Invite ─────────────────────────────────────────────────────────
    inviteSubject: "Invitation to {tenantName}",
    inviteBody: [
      "Hello {firstName},",
      "",
      "You have been added to the {tenantName} platform.",
      "",
      "To activate your account, click the link below and set your password:",
      "{link}",
      "",
      "This link is valid for 7 days.",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Password reset ─────────────────────────────────────────────────
    resetSubject: "Password reset – {tenantName}",
    resetBody: [
      "Hello {firstName},",
      "",
      "You have requested a password reset.",
      "",
      "Click the link below:",
      "{link}",
      "",
      "This link is valid for 1 hour. If you did not request a password reset, please ignore this message.",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Security: password changed ─────────────────────────────────────
    passwordChangedSubject: "Password changed – {tenantName}",
    passwordChangedBody: [
      "Hello {firstName},",
      "",
      "Your password for {tenantName} has been changed.",
      "",
      "If you did not make this change, please contact your platform administrator immediately.",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Security: email changed ────────────────────────────────────────
    emailChangedSubject: "Email address changed – {tenantName}",
    emailChangedBody: [
      "Hello {firstName},",
      "",
      "The email address for your {tenantName} account has been changed.",
      "",
      "If you did not make this change, please contact your platform administrator immediately.",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: mentor received question ─────────────────────────
    mentorQuestionSubject: "New question – {moduleTitle}",
    mentorQuestionBody: [
      "Hello {firstName},",
      "",
      "You have received a new question in module \"{moduleTitle}\" from {senderName}:",
      "",
      "\"{messagePreview}\"",
      "",
      "Reply via the platform:",
      "{link}",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: live training reminder ───────────────────────────
    liveReminderSubject: "Reminder: {eventTitle} – {startsAt}",
    liveReminderBody: [
      "Hello {firstName},",
      "",
      "Reminder for your upcoming live training:",
      "",
      "  {eventTitle}",
      "  Date & time: {startsAt}",
      "  Link: {meetUrl}",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: new knowledge digest ─────────────────────────────
    knowledgeDigestSubject: "New knowledge in {tenantName}",
    knowledgeDigestBody: [
      "Hello {firstName},",
      "",
      "New knowledge has been added to the {tenantName} platform:",
      "",
      "{moduleList}",
      "",
      "Sign in to view:",
      "{link}",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: new knowledge instant ────────────────────────────
    knowledgeInstantSubject: "New knowledge: {moduleTitle}",
    knowledgeInstantBody: [
      "Hello {firstName},",
      "",
      "New knowledge has been added to the {tenantName} platform:",
      "",
      "  {moduleTitle}",
      "",
      "View it here:",
      "{link}",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),

    // ── Notification: live event created ─────────────────────────────
    liveCreatedSubject: "New live training: {eventTitle} – {startsAt}",
    liveCreatedBody: [
      "Hello {firstName},",
      "",
      "A new live training session has been scheduled:",
      "",
      "  {eventTitle}",
      "  Date & time: {startsAt}",
      "  Link: {meetUrl}",
      "",
      "Best regards,",
      "{tenantName}",
    ].join("\n"),
  },
} as const;

/** Template key type for type safety */
export type EmailTemplateKey = keyof typeof EMAIL_DEFAULTS.sl;
