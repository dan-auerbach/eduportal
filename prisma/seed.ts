import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding database...");

  // Guard: skip if modules already exist (prevents duplicates on re-run)
  const existingModuleCount = await prisma.module.count();
  if (existingModuleCount > 0) {
    console.log(`Database already has ${existingModuleCount} modules. Skipping seed to prevent duplicates.`);
    return;
  }

  // ============================================
  // PASSWORDS
  // ============================================
  const ownerPassword = await hash("owner123", 12);
  const adminPassword = await hash("admin123", 12);
  const employeePassword = await hash("geslo123", 12);

  // ============================================
  // TENANTS
  // ============================================
  const alfa = await prisma.tenant.upsert({
    where: { slug: "alfa" },
    update: {},
    create: {
      name: "Podjetje Alfa",
      slug: "alfa",
      theme: "DEFAULT",
    },
  });
  console.log("Created tenant:", alfa.name);

  const beta = await prisma.tenant.upsert({
    where: { slug: "beta" },
    update: {},
    create: {
      name: "Podjetje Beta",
      slug: "beta",
      theme: "OCEAN",
    },
  });
  console.log("Created tenant:", beta.name);

  // ============================================
  // OWNER USER (global)
  // ============================================
  const owner = await prisma.user.upsert({
    where: { email: "owner@eduportal.si" },
    update: {},
    create: {
      email: "owner@eduportal.si",
      passwordHash: ownerPassword,
      firstName: "Owner",
      lastName: "EduPortal",
      role: "OWNER",
    },
  });
  console.log("Created OWNER:", owner.email);

  // ============================================
  // ALFA USERS
  // ============================================
  const admin = await prisma.user.upsert({
    where: { email: "admin@eduportal.si" },
    update: {},
    create: {
      email: "admin@eduportal.si",
      passwordHash: adminPassword,
      firstName: "Admin",
      lastName: "EduPortal",
      role: "SUPER_ADMIN",
    },
  });
  console.log("Created SUPER_ADMIN:", admin.email);

  const moderator = await prisma.user.upsert({
    where: { email: "moderator@eduportal.si" },
    update: {},
    create: {
      email: "moderator@eduportal.si",
      passwordHash: adminPassword,
      firstName: "Marko",
      lastName: "Novak",
      role: "ADMIN",
    },
  });
  console.log("Created ADMIN:", moderator.email);

  const alfaEmployeeData = [
    { email: "janez@eduportal.si", firstName: "Janez", lastName: "Horvat" },
    { email: "mojca@eduportal.si", firstName: "Mojca", lastName: "Kovač" },
    { email: "petra@eduportal.si", firstName: "Petra", lastName: "Zupan" },
  ];

  const alfaEmployees = [];
  for (const emp of alfaEmployeeData) {
    const user = await prisma.user.upsert({
      where: { email: emp.email },
      update: {},
      create: {
        ...emp,
        passwordHash: employeePassword,
        role: "EMPLOYEE",
      },
    });
    alfaEmployees.push(user);
    console.log("Created EMPLOYEE:", user.email);
  }

  // ============================================
  // BETA USERS
  // ============================================
  const betaAdmin = await prisma.user.upsert({
    where: { email: "beta-admin@eduportal.si" },
    update: {},
    create: {
      email: "beta-admin@eduportal.si",
      passwordHash: adminPassword,
      firstName: "Beta",
      lastName: "Admin",
      role: "ADMIN",
    },
  });
  console.log("Created Beta ADMIN:", betaAdmin.email);

  const betaEmployeeData = [
    { email: "ana@eduportal.si", firstName: "Ana", lastName: "Kos" },
    { email: "luka@eduportal.si", firstName: "Luka", lastName: "Vidmar" },
  ];

  const betaEmployees = [];
  for (const emp of betaEmployeeData) {
    const user = await prisma.user.upsert({
      where: { email: emp.email },
      update: {},
      create: {
        ...emp,
        passwordHash: employeePassword,
        role: "EMPLOYEE",
      },
    });
    betaEmployees.push(user);
    console.log("Created Beta EMPLOYEE:", user.email);
  }

  // ============================================
  // MEMBERSHIPS — ALFA
  // ============================================
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId: alfa.id } },
    update: {},
    create: { userId: admin.id, tenantId: alfa.id, role: "SUPER_ADMIN" },
  });

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: moderator.id, tenantId: alfa.id } },
    update: {},
    create: { userId: moderator.id, tenantId: alfa.id, role: "ADMIN" },
  });

  for (const emp of alfaEmployees) {
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: emp.id, tenantId: alfa.id } },
      update: {},
      create: { userId: emp.id, tenantId: alfa.id, role: "EMPLOYEE" },
    });
  }
  console.log("Created Alfa memberships");

  // ============================================
  // MEMBERSHIPS — BETA
  // ============================================
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: betaAdmin.id, tenantId: beta.id } },
    update: {},
    create: { userId: betaAdmin.id, tenantId: beta.id, role: "SUPER_ADMIN" },
  });

  for (const emp of betaEmployees) {
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: emp.id, tenantId: beta.id } },
      update: {},
      create: { userId: emp.id, tenantId: beta.id, role: "EMPLOYEE" },
    });
  }
  console.log("Created Beta memberships");

  // ============================================
  // PERMISSIONS — ALFA moderator
  // ============================================
  const moderatorPermissions = [
    "MANAGE_OWN_MODULES",
    "VIEW_ALL_PROGRESS",
    "MANAGE_USERS",
    "MANAGE_GROUPS",
    "MANAGE_QUIZZES",
    "VIEW_ANALYTICS",
    "VIEW_AUDIT_LOG",
  ] as const;

  for (const permission of moderatorPermissions) {
    await prisma.userPermission.upsert({
      where: {
        userId_permission_tenantId: {
          userId: moderator.id,
          permission,
          tenantId: alfa.id,
        },
      },
      update: {},
      create: {
        userId: moderator.id,
        tenantId: alfa.id,
        permission,
        grantedBy: admin.id,
      },
    });
  }
  console.log("Created Alfa moderator permissions");

  // ============================================
  // PERMISSIONS — BETA admin
  // ============================================
  const betaAdminPermissions = [
    "MANAGE_ALL_MODULES",
    "VIEW_ALL_PROGRESS",
    "MANAGE_USERS",
    "MANAGE_GROUPS",
    "MANAGE_QUIZZES",
    "VIEW_ANALYTICS",
    "VIEW_AUDIT_LOG",
  ] as const;

  for (const permission of betaAdminPermissions) {
    await prisma.userPermission.upsert({
      where: {
        userId_permission_tenantId: {
          userId: betaAdmin.id,
          permission,
          tenantId: beta.id,
        },
      },
      update: {},
      create: {
        userId: betaAdmin.id,
        tenantId: beta.id,
        permission,
        grantedBy: betaAdmin.id,
      },
    });
  }
  console.log("Created Beta admin permissions");

  // ============================================
  // ALFA — GROUPS
  // ============================================
  const alfaGroupData = [
    { name: "Razvoj", description: "Razvojna ekipa", color: "#3B82F6" },
    { name: "Marketing", description: "Marketing oddelek", color: "#10B981" },
    {
      name: "Novi zaposleni",
      description: "Onboarding skupina",
      color: "#F59E0B",
    },
  ];

  const alfaGroups = [];
  for (const g of alfaGroupData) {
    const group = await prisma.group.upsert({
      where: { name_tenantId: { name: g.name, tenantId: alfa.id } },
      update: {},
      create: { ...g, tenantId: alfa.id },
    });
    alfaGroups.push(group);
    console.log("Created Alfa group:", group.name);
  }

  // Assign Alfa employees to groups
  for (const emp of alfaEmployees) {
    await prisma.userGroup.upsert({
      where: {
        userId_groupId: { userId: emp.id, groupId: alfaGroups[2].id },
      },
      update: {},
      create: {
        userId: emp.id,
        groupId: alfaGroups[2].id,
        tenantId: alfa.id,
      },
    });
  }
  // First employee also in Razvoj
  await prisma.userGroup.upsert({
    where: {
      userId_groupId: { userId: alfaEmployees[0].id, groupId: alfaGroups[0].id },
    },
    update: {},
    create: {
      userId: alfaEmployees[0].id,
      groupId: alfaGroups[0].id,
      tenantId: alfa.id,
    },
  });

  // ============================================
  // ALFA — TAGS
  // ============================================
  const alfaTagNames = [
    "Varnost",
    "Onboarding",
    "Zakonodaja",
    "Tehnično",
    "Komunikacija",
  ];
  const alfaTags = [];
  for (const name of alfaTagNames) {
    const tag = await prisma.tag.upsert({
      where: { name_tenantId: { name, tenantId: alfa.id } },
      update: {},
      create: { name, tenantId: alfa.id },
    });
    alfaTags.push(tag);
  }
  console.log("Created Alfa tags");

  // ============================================
  // ALFA — MODULES (without nested sections/tags)
  // ============================================

  // Module 1: Varnost pri delu z opremo
  const module1 = await prisma.module.create({
    data: {
      tenantId: alfa.id,
      title: "Varnost pri delu z opremo",
      description:
        "Obvezen modul o varnosti pri delu z opremo v podjetju. Pokriva osnovne varnostne postopke, pravilno uporabo zaščitne opreme in ravnanje v nujnih primerih.",
      coverImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=640&h=360&fit=crop",
      status: "PUBLISHED",
      publishedAt: new Date(),
      difficulty: "BEGINNER",
      estimatedTime: 45,
      isMandatory: true,
      createdById: admin.id,
    },
  });
  console.log("Created module:", module1.title);

  // Module 1 sections
  const m1Sections = await Promise.all([
    prisma.section.create({
      data: {
        moduleId: module1.id,
        tenantId: alfa.id,
        title: "Uvod v varnost pri delu",
        content:
          "<h2>Zakaj je varnost pomembna?</h2><p>Varnost pri delu je temeljna pravica vsakega zaposlenega. V tem poglavju se boste naučili osnov varnega dela z opremo.</p><p>Statistika kaže, da se večina delovnih nesreč zgodi zaradi neupoštevanja osnovnih varnostnih pravil.</p><h3>Cilji tega modula</h3><ul><li>Razumeti osnovna varnostna pravila</li><li>Spoznati pravilno uporabo zaščitne opreme</li><li>Znati ravnati v nujnih primerih</li></ul>",
        sortOrder: 0,
        type: "TEXT",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: module1.id,
        tenantId: alfa.id,
        title: "Zakonodajni okvir",
        content:
          "<h2>Zakon o varnosti in zdravju pri delu</h2><p>Zakon o varnosti in zdravju pri delu (ZVZD-1) določa pravice in dolžnosti delodajalcev in delavcev v zvezi z varnim in zdravim delom.</p><p>Delodajalec mora zagotoviti varno delovno okolje, delavec pa mora upoštevati navodila za varno delo.</p>",
        sortOrder: 1,
        type: "TEXT",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: module1.id,
        tenantId: alfa.id,
        title: "Pravilna uporaba opreme",
        content:
          '<h2>Video navodila</h2><p>Oglejte si video o pravilni uporabi zaščitne opreme.</p><p>https://www.youtube.com/watch?v=dQw4w9WgXcQ</p><p>Po ogledu videa označite sekcijo kot pregledano.</p>',
        sortOrder: 2,
        type: "VIDEO",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: module1.id,
        tenantId: alfa.id,
        title: "Ravnanje v nujnih primerih",
        content:
          "<h2>Kaj storiti v primeru nesreče?</h2><p>V primeru delovne nesreče je ključno hitro in pravilno ukrepanje.</p><ol><li>Poskrbite za lastno varnost</li><li>Pokličite pomoč (112)</li><li>Nudite prvo pomoč, če ste usposobljeni</li><li>Obvestite nadrejenega</li><li>Zavarujte mesto nesreče</li></ol>",
        sortOrder: 3,
        type: "TEXT",
      },
    }),
  ]);

  // Set up unlock chain: section 3 unlocks after section 2, section 4 after section 3
  await prisma.section.update({
    where: { id: m1Sections[2].id },
    data: { unlockAfterSectionId: m1Sections[1].id },
  });
  await prisma.section.update({
    where: { id: m1Sections[3].id },
    data: { unlockAfterSectionId: m1Sections[2].id },
  });

  // Module 1 tags: Varnost, Zakonodaja
  await prisma.moduleTag.createMany({
    data: [
      { moduleId: module1.id, tagId: alfaTags[0].id, tenantId: alfa.id },
      { moduleId: module1.id, tagId: alfaTags[2].id, tenantId: alfa.id },
    ],
    skipDuplicates: true,
  });

  // Module 2: Onboarding
  const module2 = await prisma.module.create({
    data: {
      tenantId: alfa.id,
      title: "Onboarding - Dobrodošli v podjetju",
      description:
        "Uvodni modul za nove zaposlene. Spoznajte podjetje, kulturo, vrednote in ključne procese.",
      coverImage: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=640&h=360&fit=crop",
      status: "PUBLISHED",
      publishedAt: new Date(),
      difficulty: "BEGINNER",
      estimatedTime: 30,
      isMandatory: true,
      createdById: admin.id,
      sortOrder: 1,
    },
  });
  console.log("Created module:", module2.title);

  // Module 2 sections
  await Promise.all([
    prisma.section.create({
      data: {
        moduleId: module2.id,
        tenantId: alfa.id,
        title: "O podjetju",
        content:
          "<h2>Naša zgodba</h2><p>Podjetje je bilo ustanovljeno leta 2010 z vizijo ustvariti inovativne rešitve za naše stranke.</p><p>Danes zaposlujemo preko 50 strokovnjakov na različnih področjih.</p>",
        sortOrder: 0,
        type: "TEXT",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: module2.id,
        tenantId: alfa.id,
        title: "Vrednote in kultura",
        content:
          "<h2>Naše vrednote</h2><ul><li><strong>Transparentnost</strong> — Odkrita komunikacija na vseh ravneh</li><li><strong>Inovativnost</strong> — Spodbujamo nove ideje</li><li><strong>Timsko delo</strong> — Skupaj dosežemo več</li><li><strong>Odgovornost</strong> — Stojimo za svojim delom</li></ul>",
        sortOrder: 1,
        type: "TEXT",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: module2.id,
        tenantId: alfa.id,
        title: "Ključni procesi",
        content:
          "<h2>Kako delamo</h2><p>V tem poglavju spoznate ključne delovne procese, orodja in komunikacijske kanale.</p>",
        sortOrder: 2,
        type: "MIXED",
      },
    }),
  ]);

  // Module 2 tag: Onboarding
  await prisma.moduleTag.createMany({
    data: [
      { moduleId: module2.id, tagId: alfaTags[1].id, tenantId: alfa.id },
    ],
    skipDuplicates: true,
  });

  // Module 3: Napredne razvojne prakse
  const module3 = await prisma.module.create({
    data: {
      tenantId: alfa.id,
      title: "Napredne razvojne prakse",
      description:
        "Modul za razvojno ekipo o naprednih razvojnih praksah, vključno s code review, CI/CD in testiranjem.",
      coverImage: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=640&h=360&fit=crop",
      status: "PUBLISHED",
      publishedAt: new Date(),
      difficulty: "ADVANCED",
      estimatedTime: 90,
      isMandatory: false,
      createdById: moderator.id,
      sortOrder: 2,
    },
  });
  console.log("Created module:", module3.title);

  // Module 3 sections
  await Promise.all([
    prisma.section.create({
      data: {
        moduleId: module3.id,
        tenantId: alfa.id,
        title: "Code Review",
        content:
          "<h2>Zakaj Code Review?</h2><p>Code review je ključen del razvojnega procesa, ki izboljšuje kvaliteto kode in širi znanje v ekipi.</p>",
        sortOrder: 0,
        type: "TEXT",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: module3.id,
        tenantId: alfa.id,
        title: "CI/CD Pipeline",
        content:
          "<h2>Continuous Integration & Deployment</h2><p>Avtomatizacija build in deploy procesov zagotavlja hitro in zanesljivo dostavo programske opreme.</p>",
        sortOrder: 1,
        type: "TEXT",
      },
    }),
  ]);

  // Module 3 tag: Tehnično
  await prisma.moduleTag.createMany({
    data: [
      { moduleId: module3.id, tagId: alfaTags[3].id, tenantId: alfa.id },
    ],
    skipDuplicates: true,
  });

  // Module 4: Draft — Komunikacijske veščine
  const module4 = await prisma.module.create({
    data: {
      tenantId: alfa.id,
      title: "Komunikacijske veščine (OSNUTEK)",
      description:
        "Modul v pripravi o komunikacijskih veščinah na delovnem mestu.",
      status: "DRAFT",
      difficulty: "INTERMEDIATE",
      estimatedTime: 60,
      createdById: moderator.id,
      sortOrder: 3,
    },
  });

  // Module 4 tag: Komunikacija
  await prisma.moduleTag.createMany({
    data: [
      { moduleId: module4.id, tagId: alfaTags[4].id, tenantId: alfa.id },
    ],
    skipDuplicates: true,
  });

  // ============================================
  // ALFA — MODULE-GROUP ASSIGNMENTS
  // ============================================
  // Module 1 & 2 -> Novi zaposleni (mandatory, deadline 14 days)
  await prisma.moduleGroup.createMany({
    data: [
      {
        moduleId: module1.id,
        groupId: alfaGroups[2].id,
        tenantId: alfa.id,
        isMandatory: true,
        deadlineDays: 14,
      },
      {
        moduleId: module2.id,
        groupId: alfaGroups[2].id,
        tenantId: alfa.id,
        isMandatory: true,
        deadlineDays: 14,
      },
    ],
    skipDuplicates: true,
  });

  // Module 3 -> Razvoj
  await prisma.moduleGroup.createMany({
    data: [
      {
        moduleId: module3.id,
        groupId: alfaGroups[0].id,
        tenantId: alfa.id,
        isMandatory: false,
      },
    ],
    skipDuplicates: true,
  });

  // Module 1 -> also assigned to Razvoj
  await prisma.moduleGroup.createMany({
    data: [
      {
        moduleId: module1.id,
        groupId: alfaGroups[0].id,
        tenantId: alfa.id,
        isMandatory: true,
      },
    ],
    skipDuplicates: true,
  });

  // ============================================
  // ALFA — QUIZ for Module 1
  // ============================================
  const quiz1 = await prisma.quiz.create({
    data: {
      moduleId: module1.id,
      tenantId: alfa.id,
      title: "Preverjanje znanja - Varnost",
      description: "Preverite svoje znanje o varnosti pri delu.",
      passingScore: 70,
      maxAttempts: 3,
    },
  });

  // Quiz questions (created separately with tenantId)
  await Promise.all([
    prisma.quizQuestion.create({
      data: {
        quizId: quiz1.id,
        tenantId: alfa.id,
        question:
          "Kaj je prva stvar, ki jo naredite v primeru delovne nesreče?",
        type: "SINGLE_CHOICE",
        options: [
          { id: "a", text: "Pokličete nadrejenega", isCorrect: false },
          { id: "b", text: "Poskrbite za lastno varnost", isCorrect: true },
          { id: "c", text: "Nudite prvo pomoč", isCorrect: false },
          { id: "d", text: "Fotografirate mesto nesreče", isCorrect: false },
        ],
        sortOrder: 0,
        points: 1,
      },
    }),
    prisma.quizQuestion.create({
      data: {
        quizId: quiz1.id,
        tenantId: alfa.id,
        question:
          "Ali mora delodajalec zagotoviti varno delovno okolje?",
        type: "TRUE_FALSE",
        options: [
          { id: "true", text: "Da", isCorrect: true },
          { id: "false", text: "Ne", isCorrect: false },
        ],
        sortOrder: 1,
        points: 1,
      },
    }),
    prisma.quizQuestion.create({
      data: {
        quizId: quiz1.id,
        tenantId: alfa.id,
        question: "Katera telefonska številka je za klice v sili?",
        type: "SINGLE_CHOICE",
        options: [
          { id: "a", text: "113", isCorrect: false },
          { id: "b", text: "112", isCorrect: true },
          { id: "c", text: "116", isCorrect: false },
          { id: "d", text: "080 1234", isCorrect: false },
        ],
        sortOrder: 2,
        points: 1,
      },
    }),
  ]);
  console.log("Created quiz for module:", module1.title);

  // ============================================
  // ALFA — NOTIFICATIONS
  // ============================================
  for (const emp of alfaEmployees) {
    await prisma.notification.create({
      data: {
        userId: emp.id,
        tenantId: alfa.id,
        type: "NEW_MODULE",
        title: "Nov modul na voljo",
        message: `Modul "${module1.title}" je zdaj na voljo.`,
        link: `/modules/${module1.id}`,
      },
    });
  }
  console.log("Created Alfa notifications");

  // ============================================
  // BETA — GROUP
  // ============================================
  const betaGroup = await prisma.group.upsert({
    where: { name_tenantId: { name: "Vsi zaposleni", tenantId: beta.id } },
    update: {},
    create: {
      name: "Vsi zaposleni",
      description: "Vsi zaposleni v podjetju Beta",
      color: "#6366F1",
      tenantId: beta.id,
    },
  });
  console.log("Created Beta group:", betaGroup.name);

  // Assign Beta employees to the group
  for (const emp of betaEmployees) {
    await prisma.userGroup.upsert({
      where: {
        userId_groupId: { userId: emp.id, groupId: betaGroup.id },
      },
      update: {},
      create: {
        userId: emp.id,
        groupId: betaGroup.id,
        tenantId: beta.id,
      },
    });
  }

  // ============================================
  // BETA — TAGS
  // ============================================
  const betaTagOnboarding = await prisma.tag.upsert({
    where: { name_tenantId: { name: "Onboarding", tenantId: beta.id } },
    update: {},
    create: { name: "Onboarding", tenantId: beta.id },
  });
  const betaTagVarnost = await prisma.tag.upsert({
    where: { name_tenantId: { name: "Varnost", tenantId: beta.id } },
    update: {},
    create: { name: "Varnost", tenantId: beta.id },
  });

  // ============================================
  // BETA — MODULES
  // ============================================

  // Beta Module 1: Onboarding Beta
  const betaModule1 = await prisma.module.create({
    data: {
      tenantId: beta.id,
      title: "Onboarding Beta",
      description:
        "Uvodni modul za nove zaposlene v podjetju Beta. Spoznajte ekipo, vrednote in delovne procese.",
      coverImage: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=640&h=360&fit=crop",
      status: "PUBLISHED",
      publishedAt: new Date(),
      difficulty: "BEGINNER",
      estimatedTime: 20,
      isMandatory: true,
      createdById: betaAdmin.id,
    },
  });
  console.log("Created Beta module:", betaModule1.title);

  // Beta Module 1 sections
  await Promise.all([
    prisma.section.create({
      data: {
        moduleId: betaModule1.id,
        tenantId: beta.id,
        title: "Dobrodošli v Beta",
        content:
          "<h2>Dobrodošli!</h2><p>Veseli nas, da ste se pridružili ekipi podjetja Beta. V tem modulu boste spoznali naše vrednote, kulturo in ključne procese.</p>",
        sortOrder: 0,
        type: "TEXT",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: betaModule1.id,
        tenantId: beta.id,
        title: "Naša ekipa in procesi",
        content:
          "<h2>Ekipa</h2><p>Podjetje Beta je mlada in dinamična ekipa, ki deluje po agilnih principih. Komuniciramo preko Slack-a in tedenskih sestankov.</p>",
        sortOrder: 1,
        type: "TEXT",
      },
    }),
  ]);

  // Beta Module 1 tag
  await prisma.moduleTag.createMany({
    data: [
      {
        moduleId: betaModule1.id,
        tagId: betaTagOnboarding.id,
        tenantId: beta.id,
      },
    ],
    skipDuplicates: true,
  });

  // Beta Module 2: Varnost na delovnem mestu
  const betaModule2 = await prisma.module.create({
    data: {
      tenantId: beta.id,
      title: "Varnost na delovnem mestu",
      description:
        "Osnove varnosti na delovnem mestu za vse zaposlene v podjetju Beta.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      difficulty: "BEGINNER",
      estimatedTime: 25,
      isMandatory: true,
      createdById: betaAdmin.id,
      sortOrder: 1,
    },
  });
  console.log("Created Beta module:", betaModule2.title);

  // Beta Module 2 sections
  await Promise.all([
    prisma.section.create({
      data: {
        moduleId: betaModule2.id,
        tenantId: beta.id,
        title: "Osnovni varnostni postopki",
        content:
          "<h2>Varnost je na prvem mestu</h2><p>Vsak zaposleni mora poznati osnovne varnostne postopke. V primeru nesreče pokličite 112 in obvestite nadrejenega.</p>",
        sortOrder: 0,
        type: "TEXT",
      },
    }),
    prisma.section.create({
      data: {
        moduleId: betaModule2.id,
        tenantId: beta.id,
        title: "Požarna varnost",
        content:
          "<h2>Požarni red</h2><p>Spoznajte lokacije gasilnih aparatov, evakuacijske poti in postopke v primeru požara. Evakuacijski načrt je obešen pri vhodu v vsako pisarno.</p>",
        sortOrder: 1,
        type: "TEXT",
      },
    }),
  ]);

  // Beta Module 2 tag
  await prisma.moduleTag.createMany({
    data: [
      {
        moduleId: betaModule2.id,
        tagId: betaTagVarnost.id,
        tenantId: beta.id,
      },
    ],
    skipDuplicates: true,
  });

  // ============================================
  // BETA — MODULE-GROUP ASSIGNMENTS
  // ============================================
  await prisma.moduleGroup.createMany({
    data: [
      {
        moduleId: betaModule1.id,
        groupId: betaGroup.id,
        tenantId: beta.id,
        isMandatory: true,
        deadlineDays: 7,
      },
      {
        moduleId: betaModule2.id,
        groupId: betaGroup.id,
        tenantId: beta.id,
        isMandatory: true,
        deadlineDays: 14,
      },
    ],
    skipDuplicates: true,
  });

  // ============================================
  // BETA — NOTIFICATIONS
  // ============================================
  for (const emp of betaEmployees) {
    await prisma.notification.create({
      data: {
        userId: emp.id,
        tenantId: beta.id,
        type: "NEW_MODULE",
        title: "Nov modul na voljo",
        message: `Modul "${betaModule1.title}" je zdaj na voljo.`,
        link: `/modules/${betaModule1.id}`,
      },
    });
  }
  console.log("Created Beta notifications");

  // ============================================
  // CHANGELOG ENTRIES (global, no tenantId)
  // ============================================
  await prisma.changelogEntry.deleteMany({ where: { tenantId: null } });
  await prisma.changelogEntry.createMany({
    data: [
      {
        version: "1.00",
        title: "Začetna verzija",
        summary: "Prva verzija platforme z moduli, kvizi, certifikati in večjezično podporo.",
        isCurrent: false,
        createdAt: new Date("2026-01-15T10:00:00Z"),
      },
      {
        version: "1.01",
        title: "Izboljšan UX",
        summary: "Posodobljen dizajn, vizualna hierarhija, dashboard hero CTA in mobilna prilagoditev.",
        isCurrent: false,
        createdAt: new Date("2026-01-28T14:30:00Z"),
      },
      {
        version: "1.02",
        title: "Dodana funkcija",
        summary: "Kategorije: uporabniki lahko po novem razvrstijo module v kategorije in pripnejo priljubljene module.",
        isCurrent: false,
        createdAt: new Date("2026-02-07T08:50:00Z"),
      },
      {
        version: "1.03",
        title: "Posodobitve in RBAC",
        summary: "Dodana stran Posodobitve za pregled sprememb platforme. Revizijska sled omejena na lastnika.",
        isCurrent: true,
        createdAt: new Date("2026-02-07T10:00:00Z"),
      },
    ],
  });
  console.log("Created changelog entries");

  // ============================================
  // DONE
  // ============================================
  console.log("\nSeed completed successfully!");
  console.log("\nLogin credentials:");
  console.log("  OWNER:            owner@eduportal.si / owner123");
  console.log("  Alfa SUPER_ADMIN: admin@eduportal.si / admin123");
  console.log("  Alfa ADMIN:       moderator@eduportal.si / admin123");
  console.log("  Alfa EMPLOYEE:    janez@eduportal.si / geslo123");
  console.log("  Alfa EMPLOYEE:    mojca@eduportal.si / geslo123");
  console.log("  Alfa EMPLOYEE:    petra@eduportal.si / geslo123");
  console.log("  Beta SUPER_ADMIN: beta-admin@eduportal.si / admin123");
  console.log("  Beta EMPLOYEE:    ana@eduportal.si / geslo123");
  console.log("  Beta EMPLOYEE:    luka@eduportal.si / geslo123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
