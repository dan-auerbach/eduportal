-- CreateTable
CREATE TABLE "ModuleCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPinnedModule" (
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPinnedModule_pkey" PRIMARY KEY ("userId","moduleId")
);

-- CreateTable
CREATE TABLE "CompanyPinnedModule" (
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedById" TEXT NOT NULL,

    CONSTRAINT "CompanyPinnedModule_pkey" PRIMARY KEY ("tenantId","moduleId")
);

-- AlterTable
ALTER TABLE "Module" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ModuleCategory_name_tenantId_key" ON "ModuleCategory"("name", "tenantId");

-- CreateIndex
CREATE INDEX "ModuleCategory_tenantId_sortOrder_idx" ON "ModuleCategory"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "UserPinnedModule_moduleId_idx" ON "UserPinnedModule"("moduleId");

-- CreateIndex
CREATE INDEX "CompanyPinnedModule_moduleId_idx" ON "CompanyPinnedModule"("moduleId");

-- AddForeignKey
ALTER TABLE "ModuleCategory" ADD CONSTRAINT "ModuleCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedModule" ADD CONSTRAINT "UserPinnedModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedModule" ADD CONSTRAINT "UserPinnedModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPinnedModule" ADD CONSTRAINT "CompanyPinnedModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPinnedModule" ADD CONSTRAINT "CompanyPinnedModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ModuleCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
