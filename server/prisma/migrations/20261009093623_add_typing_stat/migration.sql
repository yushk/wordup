-- CreateTable
CREATE TABLE "TypingStat" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "bestWpm" INTEGER NOT NULL DEFAULT 0,
    "totalKeys" INTEGER NOT NULL DEFAULT 0,
    "correctKeys" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypingStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TypingStat_userId_key" ON "TypingStat"("userId");

-- AddForeignKey
ALTER TABLE "TypingStat" ADD CONSTRAINT "TypingStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
