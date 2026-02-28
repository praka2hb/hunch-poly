import { prisma } from './app/lib/db'; async function run() { const deleted = await prisma.feedItem.deleteMany({ where: { type: 'NEWS' } }); console.log('Deleted:', deleted.count); } run();
